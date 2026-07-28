import type { AiProviderConfig } from "./aiProvider";

export const REPLICATE_DEFAULT_MODEL =
  "sai88uk/minicpm-v-45-v9:5f9e86550c3540aab9292e0cae22f71bb75724be3c9bb72ebf0798d028f0f27b";

export interface ReplicateErrorDetails {
  status?: number;
  retryAfterMs?: number;
}

function numericStatus(value: unknown): number | undefined {
  const status = typeof value === "number" ? value : Number(value);
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined;
}

export function replicateErrorDetails(error: unknown): ReplicateErrorDetails {
  if (typeof error !== "object" || error === null) return {};

  const candidate = error as {
    status?: unknown;
    response?: { status?: unknown; headers?: Headers };
  };
  const status = numericStatus(candidate.status) ?? numericStatus(candidate.response?.status);
  const retryAfterValue = candidate.response?.headers?.get("retry-after");
  const retryAfterSeconds = retryAfterValue === null || retryAfterValue === undefined
    ? Number.NaN
    : Number(retryAfterValue);

  return {
    ...(status ? { status } : {}),
    ...(Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
      ? { retryAfterMs: retryAfterSeconds * 1000 }
      : {}),
  };
}

export function replicateOutputToText(output: unknown): string {
  if (typeof output === "string") return output.trim();
  if (ArrayBuffer.isView(output)) {
    const view = output as ArrayBufferView & { buffer: ArrayBuffer };
    return Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString("utf8").trim();
  }
  if (output instanceof ArrayBuffer) return Buffer.from(output).toString("utf8").trim();
  if (Array.isArray(output)) {
    return output
      .map((part) => typeof part === "string" ? part : replicateOutputToText(part))
      .join("")
      .trim();
  }
  if (output && typeof output === "object") {
    const candidate = output as Record<string, unknown>;
    for (const key of ["output", "text", "content", "response"]) {
      if (key in candidate) {
        const text = replicateOutputToText(candidate[key]);
        if (text) return text;
      }
    }
  }
  return "";
}

export async function runReplicate(
  config: AiProviderConfig,
  input: Record<string, unknown>,
  timeoutMs: number
): Promise<unknown> {
  const { default: Replicate } = await import("replicate");
  // This model returns text. Prevent the SDK from converting URL-shaped
  // outputs into FileOutput streams that cannot be parsed as model text.
  const client = new Replicate({ auth: config.apiKey, useFileOutput: false });
  const identifier = config.model as `${string}/${string}` | `${string}/${string}:${string}`;
  const signal = AbortSignal.timeout(timeoutMs);

  try {
    const output = await client.run(identifier, {
      input,
      signal,
    });
    if (signal.aborted) throw new Error(`Replicate request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
    return output;
  } catch (error) {
    const details = replicateErrorDetails(error);
    const timedOut = signal.aborted || (error instanceof Error && /aborted|timed out|timeout/i.test(error.message));
    const message = timedOut
      ? `Replicate request timed out after ${Math.round(timeoutMs / 1000)} seconds.`
      : details.status === 429
        ? "Replicate rate limit exceeded."
        : details.status
          ? `Replicate request was rejected (${details.status}).`
          : "Replicate request failed.";
    const normalized = new Error(message);
    Object.assign(normalized, details);
    throw normalized;
  }
}
