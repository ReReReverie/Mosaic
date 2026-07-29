import { afterEach, describe, expect, it, vi } from "vitest";
import { generateStructuredText, resolveAiProvider } from "./aiProvider";
import { REPLICATE_DEFAULT_MODEL } from "./replicateProvider";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("resolveAiProvider", () => {
  it("prefers a valid session override over the hosted default", () => {
    vi.stubEnv("GEMINI_API_KEY", "server-gemini-key");

    expect(resolveAiProvider({ provider: "openai", apiKey: "personal-openai-key" })).toMatchObject({
      provider: "openai",
      apiKey: "personal-openai-key",
      source: "session",
    });
  });

  it("prioritizes Groq before other configured hosted providers", () => {
    vi.stubEnv("GEMINI_API_KEY", "server-gemini-key");
    vi.stubEnv("OPENAI_API_KEY", "legacy-openai-key");
    vi.stubEnv("GROQ_API_KEY", "server-groq-key");

    expect(resolveAiProvider()).toMatchObject({
      provider: "groq",
      apiKey: "server-groq-key",
      source: "default",
    });
  });

  it("returns no provider when no server key is configured", () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("REPLICATE_API_TOKEN", "");
    vi.stubEnv("OLLAMA_ENABLED", "");

    expect(resolveAiProvider()).toBeUndefined();
  });

  it("rejects incomplete or unsupported session credentials", () => {
    expect(() => resolveAiProvider({ provider: "gemini", apiKey: "short" })).toThrow(/invalid/i);
    expect(() => resolveAiProvider({ provider: "unsupported", apiKey: "long-enough-key" })).toThrow(/supported/i);
  });

  it("sends Gemini credentials only to the Gemini server endpoint", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "{\"subject\":[]}" }] } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await generateStructuredText(
      { provider: "gemini", apiKey: "personal-gemini-key", model: "gemini-2.5-flash", source: "session" },
      "System prompt",
      "User prompt"
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("generativelanguage.googleapis.com");
    expect((request.headers as Record<string, string>)["x-goog-api-key"]).toBe("personal-gemini-key");
    expect(url).not.toContain("personal-gemini-key");
  });

  it("uses Groq from server env when configured", () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("GROQ_API_KEY", "server-groq-key");

    expect(resolveAiProvider()).toMatchObject({
      provider: "groq",
      apiKey: "server-groq-key",
      source: "default",
    });
  });

  it("uses Replicate from server env with the pinned MiniCPM-V model", () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("REPLICATE_API_TOKEN", "r8_test_token_1234567890");
    vi.stubEnv("OLLAMA_ENABLED", "");

    expect(resolveAiProvider()).toMatchObject({
      provider: "replicate",
      apiKey: "r8_test_token_1234567890",
      model: REPLICATE_DEFAULT_MODEL,
      source: "default",
    });
  });

  it("rejects text-only generation for Replicate instead of making an unsupported request", async () => {
    await expect(generateStructuredText(
      { provider: "replicate", apiKey: "r8_test_token_1234567890", model: REPLICATE_DEFAULT_MODEL, source: "session" },
      "System prompt",
      "User prompt"
    )).rejects.toThrow(/image analysis only/i);
  });

  it("accepts a Groq session override", () => {
    expect(resolveAiProvider({ provider: "groq", apiKey: "personal-groq-key-abc" })).toMatchObject({
      provider: "groq",
      source: "session",
    });
  });

  it("sends Groq credentials to the Groq endpoint", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"subject":[]}' } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await generateStructuredText(
      { provider: "groq", apiKey: "personal-groq-key-abc", model: "llama-3.3-70b-versatile", source: "session" },
      "System prompt",
      "User prompt"
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("api.groq.com");
    expect((request.headers as Record<string, string>)["Authorization"]).toBe("Bearer personal-groq-key-abc");
  });

  it("accepts Ollama without an API key", () => {
    expect(resolveAiProvider({ provider: "ollama" })).toMatchObject({
      provider: "ollama",
      apiKey: "ollama",
      source: "session",
    });
  });

  it("uses Ollama as server default when OLLAMA_ENABLED is set", () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("REPLICATE_API_TOKEN", "");
    vi.stubEnv("OLLAMA_ENABLED", "true");

    expect(resolveAiProvider()).toMatchObject({
      provider: "ollama",
      source: "default",
    });
  });

  it("sends Ollama requests to localhost by default", async () => {
    vi.stubEnv("OLLAMA_BASE_URL", "");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"subject":[]}' } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await generateStructuredText(
      { provider: "ollama", apiKey: "ollama", model: "llama3.2", source: "session" },
      "System prompt",
      "User prompt"
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("localhost:11434");
  });
});
