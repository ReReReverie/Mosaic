import { describe, expect, it, vi } from "vitest";
import type { AiProviderConfig } from "./aiProvider";
import { analyzeImageWithVision, parseVisionResult } from "./visionProvider";

describe("parseVisionResult", () => {
  it("keeps bounded semantic evidence and confidence values", () => {
    const result = parseVisionResult('```json\n{"description":"A dramatic mountain ridge","whyItFits":"The sharp ridge and strong tonal separation create an expansive, high-impact reference.","evidence":["diagonal ridge line","deep shadow against bright sky"],"tags":["mountain","dramatic","mountain"],"briefMatch":1.4,"confidence":-1}\n```');
    expect(result.semanticDescription).toBe("A dramatic mountain ridge");
    expect(result.semanticRationale).toContain("strong tonal separation");
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
});
