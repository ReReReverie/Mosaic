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

  const candidates: Array<{ value: T; start: number; end: number }> = [];
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
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          candidates.push({ value: parsed, start, end: index });
        }
        } catch {
          // Try the next possible object start. Model reasoning may contain
          // an example object before the final answer.
        }
        break;
      }
    }
  }

  // Nested objects are also valid JSON fragments, but provider responses should
  // be interpreted from their outermost object. Keep the last top-level object
  // so prose containing multiple JSON examples still behaves as before.
  const topLevelCandidates = candidates.filter((candidate, candidateIndex) =>
    !candidates.some(
      (container, containerIndex) =>
        containerIndex !== candidateIndex &&
        container.start < candidate.start &&
        container.end >= candidate.end,
    ),
  );
  const parsed = (topLevelCandidates.at(-1) ?? candidates.at(-1))?.value;
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
