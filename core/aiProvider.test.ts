import { afterEach, describe, expect, it, vi } from "vitest";
import { generateStructuredText, resolveAiProvider } from "./aiProvider";

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

  it("uses Gemini before legacy provider environment variables", () => {
    vi.stubEnv("GEMINI_API_KEY", "server-gemini-key");
    vi.stubEnv("OPENAI_API_KEY", "legacy-openai-key");

    expect(resolveAiProvider()).toMatchObject({
      provider: "gemini",
      apiKey: "server-gemini-key",
      source: "default",
    });
  });

  it("returns no provider when no server key is configured", () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");

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
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("generativelanguage.googleapis.com");
    expect((request.headers as Record<string, string>)["x-goog-api-key"]).toBe("personal-gemini-key");
    expect(url).not.toContain("personal-gemini-key");
  });
});
