import { AiProviderError, type AiProviderConfig } from "./aiProvider";
import type { ReferenceFeatures } from "./types";
import type { ReferenceFile } from "./types";
import { generateStructuredText } from "./aiProvider";
import { extractModelText, parseStructuredObject } from "./structuredJson";

const VISION_TIMEOUT_MS = 45_000;
const RATE_LIMIT_RETRIES = 2;
const DEFAULT_RATE_LIMIT_WAIT_MS = 60_000;
const SUPPORTED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const GROQ_VISION_MODEL = "qwen/qwen3.6-27b";

function isEnabled(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

export function isVisionEnabled(): boolean {
  const configured = process.env.MOSAIC_VISION_ENABLED;
  return configured === undefined ? true : isEnabled(configured);
}

export function visionFileLimit(): number {
  const configured = Number(process.env.MOSAIC_VISION_MAX_FILES ?? 50);
  return Number.isFinite(configured) ? Math.max(0, Math.min(50, Math.floor(configured))) : 50;
}

async function requestJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
  });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const providerMessage = payload && typeof payload.error === "object" && payload.error
      ? (payload.error as { message?: unknown }).message
      : undefined;
    const message = typeof providerMessage === "string"
      ? `Vision provider rejected the request (${response.status}): ${providerMessage}`
      : `Vision provider rejected the request (${response.status}).`;
    const retryAfter = Number(response.headers.get("retry-after"));
    throw new AiProviderError(message, response.status, Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined);
  }
  if (!payload) throw new Error("Vision provider returned an invalid response.");
  return payload;
}

function textFromPayload(config: AiProviderConfig, payload: Record<string, unknown>): string {
  if (config.provider === "gemini") {
    const candidates = payload.candidates;
    const parts = Array.isArray(candidates)
      ? (candidates[0] as { content?: { parts?: Array<{ text?: unknown }> } } | undefined)?.content?.parts
      : undefined;
    return parts?.map((part) => typeof part.text === "string" ? part.text : "").join("").trim() ?? "";
  }

  const choices = payload.choices;
  if (!Array.isArray(choices)) return "";
  const message = (choices[0] as { message?: { content?: unknown; output_text?: unknown } } | undefined)?.message;
  return extractModelText(message?.content ?? message?.output_text);
}

function clamp(value: unknown, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
}

/** Parse and validate the provider's small semantic response. */
export function parseVisionResult(content: string): Partial<ReferenceFeatures> {
  const parsed = parseStructuredObject<Record<string, unknown>>(content);
  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim().toLowerCase()).filter(Boolean).slice(0, 12)
    : [];
  const description = typeof parsed.description === "string" ? parsed.description.trim().slice(0, 500) : "";
  const rationaleValue = [parsed.whyItFits, parsed.rationale, parsed.matchExplanation]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);
  const rationale = rationaleValue?.trim().slice(0, 600) ?? "";
  const evidence = Array.isArray(parsed.evidence)
    ? parsed.evidence
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 5)
    : [];
  const normalizedDescription = description || (tags.length > 0
    ? `Visible signals include ${tags.slice(0, 4).join(", ")}`
    : "");
  if (!normalizedDescription) throw new Error("Vision provider returned no semantic evidence.");

  return {
    semanticDescription: normalizedDescription,
    ...(rationale ? { semanticRationale: rationale } : {}),
    ...(evidence.length > 0 ? { semanticEvidence: evidence } : {}),
    semanticTags: [...new Set(tags)],
    semanticMatch: clamp(parsed.briefMatch, 0.5),
    semanticConfidence: clamp(parsed.confidence, 0.55),
    analysisSource: "vision",
  };
}

const VISION_PROMPT = `You are checking one creative reference image against a designer's brief.
Return only JSON with this exact shape:
{"description":"short literal description","whyItFits":"specific explanation connecting visible evidence to the brief","evidence":["visible evidence 1","visible evidence 2"],"tags":["literal","visual","subject","mood"],"briefMatch":0.0,"confidence":0.0}
Use briefMatch for how directly the image supports the brief, from 0 to 1. Use confidence for how certain you are.
First describe what is visibly present, then explain WHY that evidence makes the reference useful or unsuitable for the brief. Do not write a generic caption.
Name the exact brief qualities supported (subject, mood, style, audience, or format) and the visual mechanism that supports each one. If the match is indirect, say what is missing or contradictory instead of forcing a positive claim.
Use 1–2 concrete evidence strings; each must be visibly checkable. Do not invent a format, audience, style, or subject that is not visible.
Keep the description under 30 words, whyItFits under 45 words, evidence concise, and tags specific.`;

async function generateVisionText(
  config: AiProviderConfig,
  imageData: string,
  mimeType: string,
  brief: string
): Promise<string> {
  const userText = `${VISION_PROMPT}\n\nBrief:\n${brief}`;

  if (config.provider === "gemini") {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`;
    const payload = await requestJson(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": config.apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userText }, { inline_data: { mime_type: mimeType, data: imageData } }] }],
        generationConfig: { response_mime_type: "application/json", max_output_tokens: 300 },
      }),
    });
    return textFromPayload(config, payload);
  }

  if (config.provider === "openai" || config.provider === "groq") {
    const endpoint = config.provider === "groq"
      ? "https://api.groq.com/openai/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions";
    const model = config.provider === "groq" ? GROQ_VISION_MODEL : config.model;
    const payload = await requestJson(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageData}` } },
          ],
        }],
        response_format: { type: "json_object" },
        ...(config.provider === "groq"
          ? { reasoning_effort: "none", max_completion_tokens: 220 }
          : { max_tokens: 300 }),
      }),
    });
    return textFromPayload(config, payload);
  }

  throw new Error(`${config.provider} does not have a configured vision adapter.`);
}

const FEATURE_ANALYSIS_PROMPT = `You are an analytical visual-reference reviewer.
Return only JSON with this exact shape:
{"description":"short evidence-based observation","whyItFits":"why this evidence supports or conflicts with the brief","evidence":["measured or extracted evidence 1","measured or extracted evidence 2"],"tags":["visual","composition","tone"],"briefMatch":0.0,"confidence":0.0}
Use the supplied measurements and metadata as evidence. Do not claim to see a subject that is not represented by the filename, extracted text, or measurements.
briefMatch is how useful this reference is for the brief, from 0 to 1. confidence is how reliable your conclusion is, from 0 to 1.
Separate observation from judgment: explain the visual mechanism that makes the reference useful, and name any important mismatch or limitation. Do not merely restate the filename or measurements.
Make the description and rationale specific to this reference.`;

function featureEvidence(file: ReferenceFile, features: ReferenceFeatures): string {
  return JSON.stringify({
    filename: file.filename,
    extractedText: features.extractedText.slice(0, 20),
    brightness: Number(features.brightness.toFixed(3)),
    saturation: Number(features.saturation.toFixed(3)),
    contrast: Number(features.contrast.toFixed(3)),
    edgeDensity: Number((features.edgeDensity ?? 0.3).toFixed(3)),
    aspectRatio: features.aspectRatio,
    orientation: features.orientation,
    subjectPlacement: features.subjectPlacement,
    isIllustrative: features.isIllustrative,
    colors: features.colors.slice(0, 5).map((color) => color.hex),
  });
}

async function analyzeWithFeatureEvidence(
  config: AiProviderConfig,
  file: ReferenceFile,
  features: ReferenceFeatures,
  brief: string
): Promise<Partial<ReferenceFeatures>> {
  const content = await generateStructuredText(
    config,
    FEATURE_ANALYSIS_PROMPT,
    `Brief:\n${brief}\n\nReference evidence:\n${featureEvidence(file, features)}`
  );
  return { ...parseVisionResult(content), analysisSource: "ai-text" };
}

/**
 * Enrich deterministic image features with optional multimodal evidence.
 * Unsupported providers and provider failures are intentionally surfaced to
 * the orchestrator, which keeps the deterministic result as a fallback.
 */
export async function analyzeImageWithVision(
  config: AiProviderConfig,
  buffer: Buffer,
  mimeType: string,
  brief: string
): Promise<Partial<ReferenceFeatures> | null> {
  if (!isVisionEnabled() || !SUPPORTED_MIME.has(mimeType) || !["gemini", "openai", "groq"].includes(config.provider)) return null;

  const sharp = (await import("sharp")).default;
  const normalized = await sharp(buffer)
    .resize({ width: 256, height: 256, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 60 })
    .toBuffer();
  let content = "";
  for (let attempt = 0; attempt <= RATE_LIMIT_RETRIES; attempt += 1) {
    try {
      content = await generateVisionText(config, normalized.toString("base64"), "image/jpeg", brief);
      break;
    } catch (error) {
      const isRateLimited = error instanceof AiProviderError && error.status === 429;
      if (!isRateLimited || attempt === RATE_LIMIT_RETRIES) throw error;
      // Groq's retry-after value can describe a single bucket reset while the
      // account-level TPM window is still full. Wait for a complete window so
      // the retry has a realistic chance of succeeding.
      const waitMs = Math.max(DEFAULT_RATE_LIMIT_WAIT_MS, error.retryAfterMs ?? 0);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  if (!content) throw new Error("Vision provider returned no text.");
  return parseVisionResult(content);
}

/**
 * Use the strongest analysis available for a reference. Multimodal providers
 * receive the image; text-only providers still analyze the measured evidence
 * instead of leaving the output entirely to pixel heuristics.
 */
export async function analyzeReferenceWithAi(
  config: AiProviderConfig,
  file: ReferenceFile,
  buffer: Buffer,
  features: ReferenceFeatures,
  brief: string
): Promise<Partial<ReferenceFeatures> | null> {
  if (!isVisionEnabled()) return null;

  let visionError: string | undefined;
  try {
    const visualResult = await analyzeImageWithVision(config, buffer, file.mimeType, brief);
    if (visualResult) return visualResult;
  } catch (error) {
    // A text-only analytical pass is still useful when a vision model is not
    // configured or rejects the image payload.
    visionError = error instanceof Error ? error.message : "Vision request failed.";
    if (error instanceof AiProviderError && error.status === 429) throw error;
  }

  try {
    return await analyzeWithFeatureEvidence(config, file, features, brief);
  } catch (error) {
    const textError = error instanceof Error ? error.message : "Structured AI analysis failed.";
    throw new Error(visionError ? `${visionError}; text fallback: ${textError}` : textError);
  }
}
