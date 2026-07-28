import { describe, expect, it, vi } from "vitest";
import type { AiProviderConfig } from "./aiProvider";
import { analyzeImageWithVision, analyzeReferenceWithAi, parseVisionResult } from "./visionProvider";
import { interpretPromptAnalysisDeterministic } from "./promptAnalysis";
import type { ReferenceFeatures, ReferenceFile } from "./types";

const replicateRun = vi.hoisted(() => vi.fn());
const replicateAuth = vi.hoisted(() => vi.fn());
const replicateOptions = vi.hoisted(() => vi.fn());

vi.mock("replicate", () => ({
  default: class MockReplicate {
    constructor(options: { auth: string; useFileOutput?: boolean }) {
      replicateAuth(options.auth);
      replicateOptions(options);
    }

    run(...args: unknown[]) {
      return replicateRun(...args);
    }
  },
}));

describe("parseVisionResult", () => {
  it("keeps validated dimension judgments and clamps them to the artist scale", () => {
    const prompt = interpretPromptAnalysisDeterministic("A warm portrait");
    const result = parseVisionResult(
      '{"description":"A portrait with warm light","tags":["portrait"],"dimensionEvaluations":[{"dimension":"lightingMood","applicable":true,"score":14,"reason":"warm directional light"},{"dimension":"palette","applicable":false,"score":8,"reason":"no usable color evidence"},{"dimension":"not-a-dimension","applicable":true,"score":8,"reason":"ignore"}]}',
      prompt
    );

    expect(result.semanticDimensionEvaluations).toEqual(expect.arrayContaining([
      expect.objectContaining({ dimension: "lightingMood", score: 10, applicable: true }),
      expect.objectContaining({ dimension: "palette", score: null, applicable: false }),
    ]));
    expect(result.semanticDimensionEvaluations).toHaveLength(2);
  });

  it("keeps bounded semantic evidence and confidence values", () => {
    const result = parseVisionResult('```json\n{"description":"A dramatic mountain ridge","whyItFits":"The sharp ridge and strong tonal separation create an expansive, high-impact reference.","angle":"Low horizon with a diagonal ridge that pulls the eye upward.","posterUse":"Use the open sky for a headline and let the ridge create directional movement beneath it.","evidence":["diagonal ridge line","deep shadow against bright sky"],"tags":["mountain","dramatic","mountain"],"briefMatch":1.4,"confidence":-1}\n```');
    expect(result.semanticDescription).toBe("A dramatic mountain ridge");
    expect(result.semanticRationale).toContain("strong tonal separation");
    expect(result.semanticAngle).toContain("diagonal ridge");
    expect(result.semanticPosterUse).toContain("open sky");
    expect(result.semanticEvidence).toEqual(["diagonal ridge line", "deep shadow against bright sky"]);
    expect(result.semanticTags).toEqual(["mountain", "dramatic"]);
    expect(result.semanticMatch).toBe(1);
    expect(result.semanticConfidence).toBe(0);
  });

  it("derives a custom description when a provider returns tags only", () => {
    const result = parseVisionResult('{"tags":["red curtain","two figures","theatrical"]}');
    expect(result.semanticDescription).toContain("red curtain");
    expect(result.analysisSource).toBe("vision");
  });

  it("parses Groq reasoning tags before the JSON answer", () => {
    const result = parseVisionResult('<think>Choose the visible signals carefully.</think>\n{"description":"A layered red-lit scene","tags":["red light","layered"],"briefMatch":0.8}');
    expect(result.semanticDescription).toBe("A layered red-lit scene");
  });

  it("sends Groq image analysis to qwen vision with a base64 image", async () => {
    vi.stubEnv("MOSAIC_VISION_ENABLED", "true");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.groq.com/openai/v1/chat/completions");
      const payload = JSON.parse(String(init?.body)) as {
        model: string;
        messages: Array<{ content: Array<{ type: string; image_url?: { url?: string } }> }>;
      };
      expect(payload.model).toBe("qwen/qwen3.6-27b");
      expect(payload.messages[0]?.content[1]?.type).toBe("image_url");
      expect(payload.messages[0]?.content[1]?.image_url?.url).toMatch(/^data:image\/jpeg;base64,/);

      return new Response(JSON.stringify({
        choices: [{ message: { content: [{ type: "text", text: JSON.stringify({
          description: "A red-lit theatrical scene with two figures facing one another",
          whyItFits: "The red light and face-to-face gesture create a dramatic, emotionally charged editorial reference.",
          evidence: ["red-lit backdrop", "two figures facing one another"],
          tags: ["red light", "two figures", "theatrical"],
          briefMatch: 0.82,
          confidence: 0.91,
        }) }] } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const sharp = (await import("sharp")).default;
      const buffer = await sharp({
        create: { width: 2, height: 2, channels: 3, background: { r: 190, g: 20, b: 30 } },
      }).png().toBuffer();
      const config: AiProviderConfig = {
        provider: "groq",
        apiKey: "gsk_test_key_1234567890",
        model: "llama-3.3-70b-versatile",
        source: "session",
      };

      const result = await analyzeImageWithVision(config, buffer, "image/png", "A dramatic editorial poster");
      expect(result?.semanticDescription).toContain("theatrical scene");
      expect(result?.semanticRationale).toContain("emotionally charged");
      expect(result?.semanticEvidence).toContain("red-lit backdrop");
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it("sends one normalized image to Replicate MiniCPM-V", async () => {
    vi.stubEnv("MOSAIC_VISION_ENABLED", "true");
    replicateRun.mockResolvedValue(JSON.stringify({
      description: "A red-lit theatrical scene with two figures facing one another",
      whyItFits: "The red light and face-to-face gesture create a dramatic editorial reference.",
      evidence: ["red-lit backdrop", "two figures facing one another"],
      tags: ["red light", "two figures", "theatrical"],
      briefMatch: 0.82,
      confidence: 0.91,
    }));

    try {
      const sharp = (await import("sharp")).default;
      const buffer = await sharp({
        create: { width: 2, height: 2, channels: 3, background: { r: 190, g: 20, b: 30 } },
      }).png().toBuffer();
      const config: AiProviderConfig = {
        provider: "replicate",
        apiKey: "r8_test_token_1234567890",
        model: "sai88uk/minicpm-v-45-v9:version",
        source: "session",
      };

      const result = await analyzeImageWithVision(config, buffer, "image/png", "A dramatic editorial poster");
      const [identifier, options] = replicateRun.mock.calls[0] as [string, { input: Record<string, unknown> }];
      expect(replicateAuth).toHaveBeenCalledWith("r8_test_token_1234567890");
      expect(replicateOptions).toHaveBeenCalledWith({ auth: "r8_test_token_1234567890", useFileOutput: false });
      expect(identifier).toBe("sai88uk/minicpm-v-45-v9:version");
      expect(options.input.image).toMatch(/^data:image\/jpeg;base64,/);
      expect(options.input.video).toBeUndefined();
      expect(options.input.video_fps).toBeUndefined();
      expect(options.input.thinking_mode).toBe("fast");
      expect(options.input.question).toContain("Mosaic's visual-reference analysis engine");
      expect(options.input.question).toContain("poster or artwork");
      expect(options.input.question).toContain("BRIEF_START\nA dramatic editorial poster\nBRIEF_END");
      expect(result?.semanticDescription).toContain("theatrical scene");
      expect(result?.semanticEvidence).toContain("red-lit backdrop");
    } finally {
      replicateRun.mockReset();
      replicateAuth.mockReset();
      replicateOptions.mockReset();
      vi.unstubAllEnvs();
    }
  });

  it("retries one empty or timed-out Replicate response before accepting vision output", async () => {
    vi.stubEnv("MOSAIC_VISION_ENABLED", "true");
    replicateRun
      .mockRejectedValueOnce(new Error("Replicate request timed out after 120 seconds."))
      .mockResolvedValueOnce(JSON.stringify({
        description: "A red-lit theatrical scene with two figures facing one another",
        whyItFits: "The red light and face-to-face gesture create a dramatic editorial reference.",
        evidence: ["red-lit backdrop"],
        tags: ["red light", "two figures"],
        briefMatch: 0.82,
        confidence: 0.91,
      }));

    try {
      const sharp = (await import("sharp")).default;
      const buffer = await sharp({
        create: { width: 2, height: 2, channels: 3, background: { r: 190, g: 20, b: 30 } },
      }).png().toBuffer();
      const config: AiProviderConfig = {
        provider: "replicate",
        apiKey: "r8_test_token_1234567890",
        model: "sai88uk/minicpm-v-45-v9:version",
        source: "session",
      };

      const result = await analyzeImageWithVision(config, buffer, "image/png", "A dramatic editorial poster");
      expect(replicateRun).toHaveBeenCalledTimes(2);
      expect(result?.semanticDescription).toContain("theatrical scene");
    } finally {
      replicateRun.mockReset();
      replicateAuth.mockReset();
      replicateOptions.mockReset();
      vi.unstubAllEnvs();
    }
  });

  it("does not attempt a text fallback when Replicate image analysis fails", async () => {
    vi.stubEnv("MOSAIC_VISION_ENABLED", "true");
    replicateRun.mockResolvedValue("");

    const file: ReferenceFile = {
      id: "replicate-fallback",
      path: "/refs/replicate-fallback.png",
      filename: "replicate-fallback.png",
      mimeType: "image/png",
      sizeBytes: 100,
      lastModified: 0,
    };

    try {
      const sharp = (await import("sharp")).default;
      const buffer = await sharp({
        create: { width: 2, height: 2, channels: 3, background: { r: 190, g: 20, b: 30 } },
      }).png().toBuffer();
      const config: AiProviderConfig = {
        provider: "replicate",
        apiKey: "r8_test_token_1234567890",
        model: "sai88uk/minicpm-v-45-v9:version",
        source: "session",
      };

      await expect(analyzeReferenceWithAi(
        config,
        file,
        buffer,
        {} as ReferenceFeatures,
        "A dramatic editorial poster",
      )).rejects.toThrow(/Replicate image analysis failed/);
      expect(replicateRun).toHaveBeenCalledTimes(2);
    } finally {
      replicateRun.mockReset();
      vi.unstubAllEnvs();
    }
  });

  it("sends one normalized image to Ollama's vision chat API", async () => {
    vi.stubEnv("MOSAIC_VISION_ENABLED", "true");
    vi.stubEnv("OLLAMA_BASE_URL", "http://host.docker.internal:11434");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://host.docker.internal:11434/api/chat");
      const payload = JSON.parse(String(init?.body)) as {
        model: string;
        stream: boolean;
        format: string;
        messages: Array<{ content: string; images?: string[] }>;
      };
      expect(payload.model).toBe("llama3.2-vision");
      expect(payload.stream).toBe(false);
      expect(payload.format).toBe("json");
      expect(payload.messages[0]?.content).toContain("Mosaic's visual-reference analysis engine");
      expect(payload.messages[0]?.images?.[0]).toMatch(/^[A-Za-z0-9+/=]+$/);

      return new Response(JSON.stringify({
        message: { content: JSON.stringify({
          description: "A red-lit theatrical scene with two figures facing one another",
          whyItFits: "The red light and face-to-face gesture create a dramatic editorial reference.",
          evidence: ["red-lit backdrop", "two figures facing one another"],
          tags: ["red light", "two figures", "theatrical"],
          briefMatch: 0.82,
          confidence: 0.91,
        }) },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const sharp = (await import("sharp")).default;
      const buffer = await sharp({
        create: { width: 2, height: 2, channels: 3, background: { r: 190, g: 20, b: 30 } },
      }).png().toBuffer();
      const config: AiProviderConfig = {
        provider: "ollama",
        apiKey: "ollama",
        model: "llama3.2-vision",
        source: "session",
      };

      const result = await analyzeImageWithVision(config, buffer, "image/png", "A dramatic editorial poster");
      expect(result?.semanticDescription).toContain("theatrical scene");
      expect(result?.semanticEvidence).toContain("red-lit backdrop");
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });
});
