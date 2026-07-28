import { extractModelText } from "./structuredJson";
import { REPLICATE_DEFAULT_MODEL } from "./replicateProvider";

export const AI_PROVIDERS = ["gemini", "openai", "anthropic", "groq", "ollama", "replicate"] as const;

export type AiProvider = (typeof AI_PROVIDERS)[number];
export type AiProviderSource = "default" | "session";

export interface AiProviderConfig {
  provider: AiProvider;
  apiKey: string;
  model: string;
  source: AiProviderSource;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  gemini: "Google Gemini",
  openai: "OpenAI",
  anthropic: "Anthropic Claude",
  groq: "Groq",
  ollama: "Ollama (local)",
  replicate: "Replicate (MiniCPM-V)",
};

const DEFAULT_MODELS: Record<AiProvider, string> = {
  gemini: "gemini-2.0-flash",
  openai: "gpt-4o",
  anthropic: "claude-3-5-haiku-latest",
  groq: "qwen/qwen3.6-27b",
  ollama: "llama3.2-vision",
  replicate: REPLICATE_DEFAULT_MODEL,
};
const GROQ_STRUCTURED_MODEL = "qwen/qwen3.6-27b";

const MAX_API_KEY_LENGTH = 512;
const PROVIDER_TIMEOUT_MS = 30_000;

function readSecret(value: string | undefined): string | undefined {
  const secret = value?.trim();
  return secret ? secret : undefined;
}

function normalizeProvider(value: string | undefined): AiProvider {
  if (value && AI_PROVIDERS.includes(value as AiProvider)) {
    return value as AiProvider;
  }
  throw new Error("Choose a supported AI provider.");
}

function modelFor(provider: AiProvider, source: AiProviderSource): string {
  if (source === "default") {
    const environmentModel = readSecret(
      provider === "gemini"
        ? process.env.GEMINI_MODEL
        : provider === "openai"
          ? process.env.OPENAI_MODEL
          : provider === "anthropic"
            ? process.env.ANTHROPIC_MODEL
            : provider === "groq"
              ? process.env.GROQ_MODEL
              : provider === "ollama"
                ? process.env.OLLAMA_MODEL
                : process.env.REPLICATE_MODEL
    );
    if (environmentModel) return environmentModel;
  }
  return DEFAULT_MODELS[provider];
}

/**
 * Resolves the session override first, then the server's configured default.
 * The returned session key is request-scoped data and must never be persisted.
 *
 * Ollama runs locally and needs no real API key. When provider is "ollama" and
 * no key is supplied, the placeholder "ollama" is used so the schema stays
 * consistent; Ollama ignores the Authorization header entirely.
 */
export function resolveAiProvider(override?: {
  provider?: string | null;
  apiKey?: string | null;
}): AiProviderConfig | undefined {
  const overrideKey = readSecret(override?.apiKey ?? undefined);
  const overrideProvider = readSecret(override?.provider ?? undefined);

  if (overrideKey || overrideProvider) {
    const provider = normalizeProvider(overrideProvider?.toLowerCase());
    // Ollama is keyless — accept a missing or placeholder key
    const isOllama = provider === "ollama";
    const effectiveKey = overrideKey ?? (isOllama ? "ollama" : undefined);
    if (!effectiveKey || (!isOllama && (effectiveKey.length < 10 || effectiveKey.length > MAX_API_KEY_LENGTH))) {
      throw new Error("The personal API key is invalid.");
    }
    return {
      provider,
      apiKey: effectiveKey,
      model: modelFor(provider, "session"),
      source: "session",
    };
  }

  const defaultCredentials: Array<[AiProvider, string | undefined]> = [
    ["gemini", readSecret(process.env.GEMINI_API_KEY)],
    ["openai", readSecret(process.env.OPENAI_API_KEY)],
    ["anthropic", readSecret(process.env.ANTHROPIC_API_KEY)],
    ["groq", readSecret(process.env.GROQ_API_KEY)],
    ["replicate", readSecret(process.env.REPLICATE_API_TOKEN)],
    // Ollama is always available locally — use it as final fallback when enabled
    ["ollama", readSecret(process.env.OLLAMA_ENABLED) ? "ollama" : undefined],
  ];

  const configured = defaultCredentials.find(([, key]) => key);
  if (!configured) return undefined;

  const [provider, apiKey] = configured;
  return {
    provider,
    apiKey: apiKey as string,
    model: modelFor(provider, "default"),
    source: "default",
  };
}

function providerName(provider: AiProvider): string {
  return AI_PROVIDER_LABELS[provider];
}

async function requestJson(
  provider: AiProvider,
  url: string,
  init: RequestInit
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch {
    throw new Error(`${providerName(provider)} is unavailable right now.`);
  }

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const providerMessage = payload && typeof payload.error === "object" && payload.error
      ? (payload.error as { message?: unknown }).message
      : undefined;
    const message = typeof providerMessage === "string"
      ? `${providerName(provider)} rejected the request (${response.status}): ${providerMessage}`
      : `${providerName(provider)} rejected the request (${response.status}).`;
    const retryAfter = Number(response.headers.get("retry-after"));
    throw new AiProviderError(message, response.status, Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined);
  }
  if (!payload) throw new Error(`${providerName(provider)} returned an empty response.`);
  return payload;
}

async function generateWithGemini(
  config: AiProviderConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`;
  const payload = await requestJson("gemini", endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": config.apiKey,
    },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: `${systemPrompt}\n\nBrief to interpret:\n${userPrompt}` }],
      }],
      generationConfig: {
        response_mime_type: "application/json",
        max_output_tokens: 500,
      },
    }),
  });

  const candidates = payload.candidates;
  if (!Array.isArray(candidates)) throw new Error("Gemini returned no candidates.");
  const parts = (candidates[0] as { content?: { parts?: Array<{ text?: unknown }> } } | undefined)?.content?.parts;
  const text = parts?.map((part) => typeof part.text === "string" ? part.text : "").join("").trim();
  if (!text) throw new Error("Gemini returned no text.");
  return text;
}

async function generateWithOpenAI(
  config: AiProviderConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: config.apiKey, timeout: PROVIDER_TIMEOUT_MS, maxRetries: 0 });
  const response = await client.chat.completions.create({
    model: config.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 500,
  });
  const text = response.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenAI returned no text.");
  return text;
}

async function generateWithAnthropic(
  config: AiProviderConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const payload = await requestJson("anthropic", "https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  const content = payload.content;
  if (!Array.isArray(content)) throw new Error("Anthropic returned no content.");
  const text = content.map((part) => {
    if (!part || typeof part !== "object") return "";
    const value = (part as { text?: unknown }).text;
    return typeof value === "string" ? value : "";
  }).join("").trim();
  if (!text) throw new Error("Anthropic returned no text.");
  return text;
}

/**
 * Shared implementation for OpenAI-compatible chat/completions endpoints.
 * Used by both Groq and Ollama.
 */
async function generateWithOpenAiCompat(
  provider: AiProvider,
  baseUrl: string,
  config: AiProviderConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const payload = await requestJson(provider, `${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: provider === "groq" ? GROQ_STRUCTURED_MODEL : config.model,
      messages: provider === "groq"
        ? [{ role: "user", content: `${systemPrompt}\n\n${userPrompt}` }]
        : [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
      ...(provider === "groq"
        ? {
            response_format: { type: "json_object" },
            reasoning_effort: "none",
            max_completion_tokens: 500,
          }
        : { max_tokens: 500 }),
    }),
  });

  const choices = payload.choices;
  if (!Array.isArray(choices)) throw new Error(`${providerName(provider)} returned no choices.`);
  const message = (choices[0] as { message?: { content?: unknown; output_text?: unknown } } | undefined)?.message;
  const text = extractModelText(message?.content ?? message?.output_text);
  if (!text) throw new Error(`${providerName(provider)} returned no text.`);
  return text;
}

export async function generateStructuredText(
  config: AiProviderConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  if (config.provider === "gemini") return generateWithGemini(config, systemPrompt, userPrompt);
  if (config.provider === "openai") return generateWithOpenAI(config, systemPrompt, userPrompt);
  if (config.provider === "anthropic") return generateWithAnthropic(config, systemPrompt, userPrompt);
  if (config.provider === "groq") return generateWithOpenAiCompat("groq", "https://api.groq.com/openai", config, systemPrompt, userPrompt);
  if (config.provider === "replicate") {
    throw new Error("Replicate is configured for image analysis only; text-only generation is not supported.");
  }
  // ollama
  const ollamaBase = readSecret(process.env.OLLAMA_BASE_URL) ?? "http://localhost:11434";
  return generateWithOpenAiCompat("ollama", ollamaBase, config, systemPrompt, userPrompt);
}
