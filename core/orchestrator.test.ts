import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { getAiMaxConcurrency, runAnalysis } from "./orchestrator";
import { AiProviderError, type AiProviderConfig } from "./aiProvider";
import type { ProgressEvent, ReferenceFile } from "./types";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("runAnalysis AI coverage reporting", () => {
  it("reports provider failures instead of hiding deterministic fallback", async () => {
    const file: ReferenceFile = {
      id: "groq-failure-reference",
      path: "/refs/reference.jpg",
      filename: "reference.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 100,
      lastModified: 0,
    };
    const buffer = await sharp({
      create: { width: 2, height: 2, channels: 3, background: { r: 190, g: 20, b: 30 } },
    }).jpeg().toBuffer();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"subject":[],"audience":[],"mood":[],"style":[],"colors":[],"formats":[],"ambiguities":[]}' } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const provider: AiProviderConfig = {
      provider: "groq",
      apiKey: "gsk_test_key_1234567890",
      model: "qwen/qwen3.6-27b",
      source: "default",
    };
    const events: ProgressEvent[] = [];

    for await (const event of runAnalysis({
      files: [file],
      brief: "A dramatic editorial poster",
      aiProvider: provider,
      analyzeVision: async () => {
        throw new Error("Groq rejected the request (400): invalid image payload");
      },
      readFile: async () => buffer,
    })) {
      events.push(event);
    }

    const result = events.find((event) => event.type === "done")?.result;
    expect(result?.aiAnalysis).toMatchObject({
      enabled: true,
      provider: "groq",
      requested: 1,
      visionCompleted: 0,
      textFallback: 0,
      failed: 1,
    });
    expect(result?.aiAnalysis?.errors[0]).toContain("invalid image payload");
    expect(result?.references[0]?.features.analysisSource).toBe("deterministic");
  });

  it("retains all four references when one Replicate enrichment request fails", async () => {
    const files: ReferenceFile[] = Array.from({ length: 4 }, (_, index) => ({
      id: `replicate-reference-${index}`,
      path: `/refs/replicate-${index}.jpg`,
      filename: `replicate-${index}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 100,
      lastModified: 0,
    }));
    const buffer = await sharp({
      create: { width: 2, height: 2, channels: 3, background: { r: 190, g: 20, b: 30 } },
    }).jpeg().toBuffer();
    const events: ProgressEvent[] = [];

    for await (const event of runAnalysis({
      files,
      brief: "A dramatic editorial poster",
      aiProvider: {
        provider: "replicate",
        apiKey: "r8_test_token_1234567890",
        model: "sai88uk/minicpm-v-45-v9:version",
        source: "default",
      },
      analyzeVision: async (file) => {
        if (file.id === files[2]?.id) throw new Error("Replicate image analysis failed: Replicate request timed out.");
        return {
          semanticDescription: "A distinct visual arrangement",
          semanticTags: ["distinct"],
          semanticMatch: 0.8,
          semanticConfidence: 0.9,
          analysisSource: "vision" as const,
        };
      },
      readFile: async () => buffer,
    })) {
      events.push(event);
    }

    const result = events.find((event) => event.type === "done")?.result;
    expect(result?.references).toHaveLength(4);
    expect(result?.references.map((reference) => reference.file.id).sort()).toEqual(files.map((file) => file.id).sort());
    expect(result?.aiAnalysis).toMatchObject({ requested: 4, visionCompleted: 3, failed: 1 });
    expect(result?.references.find((reference) => reference.file.id === files[2]?.id)?.features.analysisSource).toBe("deterministic");
  });

  it("keeps four AI requests active and refills a slot as soon as one completes", async () => {
    const files: ReferenceFile[] = Array.from({ length: 8 }, (_, index) => ({
      id: `groq-paced-${index}`,
      path: `/refs/reference-${index}.jpg`,
      filename: `reference-${index}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 100,
      lastModified: 0,
    }));
    const buffer = await sharp({
      create: { width: 2, height: 2, channels: 3, background: { r: 190, g: 20, b: 30 } },
    }).jpeg().toBuffer();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"subject":[],"audience":[],"mood":[],"style":[],"colors":[],"formats":[],"ambiguities":[]}' } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    let active = 0;
    let maxActive = 0;
    let started = 0;
    let firstCompletionObserved = false;
    let refillObserved = false;
    let releaseInitialRequests!: () => void;
    const initialRequests = new Promise<void>((resolve) => {
      releaseInitialRequests = resolve;
    });
    const events: ProgressEvent[] = [];
    for await (const event of runAnalysis({
      files,
      brief: "A dramatic editorial poster",
      aiProvider: {
        provider: "groq",
        apiKey: "gsk_test_key_1234567890",
        model: "qwen/qwen3.6-27b",
        source: "default",
      },
      analyzeVision: async () => {
        started += 1;
        const requestNumber = started;
        if (firstCompletionObserved) refillObserved = true;
        active += 1;
        maxActive = Math.max(maxActive, active);
        if (requestNumber === 4) releaseInitialRequests();
        if (requestNumber <= 4) await initialRequests;
        else await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        firstCompletionObserved = true;
        return {
          semanticDescription: "A distinct visual arrangement",
          semanticTags: ["distinct"],
          semanticMatch: 0.8,
          semanticConfidence: 0.9,
          analysisSource: "vision" as const,
        };
      },
      readFile: async () => buffer,
    })) {
      events.push(event);
    }

    const result = events.find((event) => event.type === "done")?.result;
    const perFileProgress = events.filter(
      (event) => event.type === "file-analysis-progress" && event.message.startsWith("Analysed ")
    );
    const partialResults = perFileProgress.filter((event) => event.partialReferences?.length);
    expect(maxActive).toBe(4);
    expect(refillObserved).toBe(true);
    expect(started).toBe(files.length);
    expect(perFileProgress).toHaveLength(files.length);
    expect(partialResults).toHaveLength(files.length);
    expect(partialResults.at(-1)?.partialReferences).toHaveLength(files.length);
    expect(perFileProgress.map((event) => event.message)).toEqual(
      files.map((_, index) => `Analysed ${index + 1} / ${files.length} files…`)
    );
    expect(result?.aiAnalysis).toMatchObject({ requested: 8, visionCompleted: 8, failed: 0 });
    expect(result?.references.map((reference) => reference.file.id)).toEqual(
      files.map((file) => file.id)
    );
  });

  it("backs off after an exhausted 429 and keeps deterministic fallback results", async () => {
    const files: ReferenceFile[] = Array.from({ length: 8 }, (_, index) => ({
      id: `groq-throttled-${index}`,
      path: `/refs/throttled-${index}.jpg`,
      filename: `throttled-${index}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 100,
      lastModified: 0,
    }));
    const buffer = await sharp({
      create: { width: 2, height: 2, channels: 3, background: { r: 190, g: 20, b: 30 } },
    }).jpeg().toBuffer();

    let active = 0;
    let maxActiveAfterThrottle = 0;
    let callCount = 0;
    let rateLimitedFileId = "";
    const events: ProgressEvent[] = [];
    for await (const event of runAnalysis({
      files,
      brief: "A dramatic editorial poster",
      aiProvider: {
        provider: "groq",
        apiKey: "gsk_test_key_1234567890",
        model: "qwen/qwen3.6-27b",
        source: "default",
      },
      analyzeVision: async (file) => {
        callCount += 1;
        active += 1;
        if (callCount > 4) maxActiveAfterThrottle = Math.max(maxActiveAfterThrottle, active);
        if (callCount === 1) {
          rateLimitedFileId = file.id;
          await new Promise((resolve) => setTimeout(resolve, 5));
          active -= 1;
          throw new AiProviderError("provider rate limit exhausted", 429);
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
        active -= 1;
        return {
          semanticDescription: "A distinct visual arrangement",
          semanticTags: ["distinct"],
          semanticMatch: 0.8,
          semanticConfidence: 0.9,
          analysisSource: "vision" as const,
        };
      },
      readFile: async () => buffer,
    })) {
      events.push(event);
    }

    const result = events.find((event) => event.type === "done")?.result;
    const throttledReference = result?.references.find((reference) => reference.file.id === rateLimitedFileId);
    expect(maxActiveAfterThrottle).toBeLessThanOrEqual(2);
    expect(callCount).toBe(files.length);
    expect(result?.aiAnalysis).toMatchObject({
      requested: 8,
      visionCompleted: 7,
      failed: 1,
    });
    expect(throttledReference?.features.analysisSource).toBe("deterministic");
    expect(result?.references.map((reference) => reference.file.id).sort()).toEqual(
      files.map((file) => file.id).sort()
    );
    expect(result?.references.at(-1)?.file.id).toBe(rateLimitedFileId);
  });

  it("clamps configured AI concurrency to the supported range", () => {
    vi.stubEnv("MOSAIC_AI_MAX_CONCURRENCY", "0");
    expect(getAiMaxConcurrency()).toBe(1);

    vi.stubEnv("MOSAIC_AI_MAX_CONCURRENCY", "2.9");
    expect(getAiMaxConcurrency()).toBe(2);

    vi.stubEnv("MOSAIC_AI_MAX_CONCURRENCY", "99");
    expect(getAiMaxConcurrency()).toBe(4);

    vi.stubEnv("MOSAIC_AI_MAX_CONCURRENCY", "invalid");
    expect(getAiMaxConcurrency()).toBe(4);
  });
});
