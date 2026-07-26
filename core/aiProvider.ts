export const AI_PROVIDERS = ["gemini", "openai", "anthropic"] as const;

export type AiProvider = (typeof AI_PROVIDERS)[number];
export type AiProviderSource = "default" | "session";

export interface AiProviderConfig {
  provider: AiProvider;
  apiKey: string;
  model: string;
  source: AiProviderSource;
}

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  gemini: "Google Gemini",
  openai: "OpenAI",
  anthropic: "Anthropic Claude",
};

const DEFAULT_MODELS: Record<AiProvider, string> = {
  gemini: "gemini-2.5-flash",
  openai: "gpt-4o",
  anthropic: "claude-3-5-haiku-latest",
};

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
          : process.env.ANTHROPIC_MODEL
    );
    if (environmentModel) return environmentModel;
  }
  return DEFAULT_MODELS[provider];
}

/**
 * Resolves the session override first, then the server's configured default.
 * The returned session key is request-scoped data and must never be persisted.
 */
export function resolveAiProvider(override?: {
  provider?: string | null;
  apiKey?: string | null;
}): AiProviderConfig | undefined {
  const overrideKey = readSecret(override?.apiKey ?? undefined);
  const overrideProvider = readSecret(override?.provider ?? undefined);

  if (overrideKey || overrideProvider) {
    if (!overrideKey || overrideKey.length < 10 || overrideKey.length > MAX_API_KEY_LENGTH) {
      throw new Error("The personal API key is invalid.");
    }
    const provider = normalizeProvider(overrideProvider?.toLowerCase());
    return {
      provider,
      apiKey: overrideKey,
      model: modelFor(provider, "session"),
      source: "session",
    };
  }

  const defaultCredentials: Array<[AiProvider, string | undefined]> = [
    ["gemini", readSecret(process.env.GEMINI_API_KEY)],
    ["openai", readSecret(process.env.OPENAI_API_KEY)],
    ["anthropic", readSecret(process.env.ANTHROPIC_API_KEY)],
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
    throw new Error(`${providerName(provider)} rejected the request (${response.status}).`);
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

export async function generateStructuredText(
  config: AiProviderConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  if (config.provider === "gemini") return generateWithGemini(config, systemPrompt, userPrompt);
  if (config.provider === "openai") return generateWithOpenAI(config, systemPrompt, userPrompt);
  return generateWithAnthropic(config, systemPrompt, userPrompt);
}
