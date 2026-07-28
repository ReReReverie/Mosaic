/**
 * Parse an object from model output that may contain reasoning tags,
 * markdown fences, or a short prose preamble around the JSON answer.
 * Reasoning-capable models commonly emit <think>...</think> before JSON.
 */
export function parseStructuredObject<T extends Record<string, unknown>>(content: string): T {
  const cleaned = content
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<analysis>[\s\S]*?<\/analysis>/gi, "")
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim();

  const candidates: T[] = [];
  for (let start = cleaned.indexOf("{"); start >= 0; start = cleaned.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < cleaned.length; index += 1) {
      const character = cleaned[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') {
        inString = true;
        continue;
      }
      if (character === "{") depth += 1;
      if (character === "}") depth -= 1;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(cleaned.slice(start, index + 1)) as T;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) candidates.push(parsed);
        } catch {
          // Try the next possible object start. Model reasoning may contain
          // an example object before the final answer.
        }
        break;
      }
    }
  }

  const parsed = candidates.at(-1);
  if (!parsed) throw new Error("AI provider returned invalid structured JSON.");
  return parsed;
}

/** Normalize the content variants returned by OpenAI-compatible providers. */
export function extractModelText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value.map((part) => extractModelText(part)).filter(Boolean).join("\n").trim();
  }
  if (value && typeof value === "object") {
    const part = value as Record<string, unknown>;
    for (const key of ["text", "content", "output_text"]) {
      const text = extractModelText(part[key]);
      if (text) return text;
    }
  }
  return "";
}
