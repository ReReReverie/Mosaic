import type { CreativeDirection } from "./types";
import {
  MOOD_TERMS,
  STYLE_TERMS,
  AUDIENCE_TERMS,
  SUBJECT_TERMS,
  COLOR_DIRECTION_TERMS,
  FORMAT_TERMS,
  CONFLICTING_PAIRS,
} from "./keywords";
import type { AiProviderConfig } from "./aiProvider";
import { generateStructuredText } from "./aiProvider";

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Interpreter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Match a dictionary of term → canonical value against a lowercase string.
 * Returns an array of unique canonical values found.
 */
function matchTerms(
  text: string,
  dict: Record<string, string>
): string[] {
  const found = new Set<string>();
  for (const [term, canonical] of Object.entries(dict)) {
    // Word-boundary match — avoids "food" matching "seafood" unexpectedly
    const pattern = new RegExp(`\\b${term.replace("-", "\\-")}\\b`, "i");
    if (pattern.test(text)) {
      found.add(canonical);
    }
  }
  return [...found];
}

/**
 * Check for conflicting signals and return human-readable ambiguity messages.
 */
function detectAmbiguities(text: string): string[] {
  const ambiguities: string[] = [];
  for (const [groupA, groupB] of CONFLICTING_PAIRS) {
    const foundA = groupA.filter((t) =>
      new RegExp(`\\b${t}\\b`, "i").test(text)
    );
    const foundB = groupB.filter((t) =>
      new RegExp(`\\b${t}\\b`, "i").test(text)
    );
    if (foundA.length > 0 && foundB.length > 0) {
      ambiguities.push(
        `Conflicting signals detected: "${foundA[0]}" and "${foundB[0]}" suggest opposing directions. ` +
          `Choose one as the primary direction or allow both as separate directions.`
      );
    }
  }
  return ambiguities;
}

/**
 * Deterministic prompt interpretation using keyword dictionaries.
 * No external dependencies — works without an API key.
 */
export function interpretDeterministic(brief: string): CreativeDirection {
  const text = brief.toLowerCase();

  return {
    subject: matchTerms(text, SUBJECT_TERMS),
    audience: matchTerms(text, AUDIENCE_TERMS),
    mood: matchTerms(text, MOOD_TERMS),
    style: matchTerms(text, STYLE_TERMS),
    colors: matchTerms(text, COLOR_DIRECTION_TERMS),
    formats: matchTerms(text, FORMAT_TERMS),
    constraints: [],
    ambiguities: detectAmbiguities(text),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider-backed interpretation is optional; Gemini is the hosted default.
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a creative direction analyst. Extract structured intent from a designer's brief.
Return ONLY a valid JSON object matching this schema exactly — no markdown, no explanation:
{
  "subject": string[],
  "audience": string[],
  "mood": string[],
  "style": string[],
  "colors": string[],
  "formats": string[],
  "constraints": [],
  "ambiguities": string[]
}
- subject: visual subjects (food, people, architecture, nature, products, etc.)
- audience: target audience descriptors
- mood: emotional tone (warm, calm, energetic, serious, playful, dark, bright, etc.)
- style: visual style (editorial, minimalist, experimental, retro, handmade, etc.)
- colors: color direction (warm, cool, muted, vibrant, monochrome, pastel, etc.)
- formats: output format (poster, logo, website, social, print, screen, etc.)
- constraints: always empty array — do not add constraints
- ambiguities: any conflicting or unclear signals in the brief as plain strings
Use only values appropriate for the brief. Keep arrays concise (max 4 items each).`;

function stringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("AI output is missing a valid " + field + " array.");
  }
  return value.slice(0, 4) as string[];
}

function parseProviderDirection(content: string): CreativeDirection {
  const trimmed = content.trim();
  const fence = String.fromCharCode(96).repeat(3);
  const normalized = trimmed.startsWith(fence)
    ? trimmed.split(/\r?\n/).slice(1, -1).join("\n").trim()
    : trimmed;
  const parsed = JSON.parse(normalized) as Partial<CreativeDirection>;

  return {
    subject: stringList(parsed.subject, "subject"),
    audience: stringList(parsed.audience, "audience"),
    mood: stringList(parsed.mood, "mood"),
    style: stringList(parsed.style, "style"),
    colors: stringList(parsed.colors, "colors"),
    formats: stringList(parsed.formats, "formats"),
    constraints: [],
    ambiguities: stringList(parsed.ambiguities, "ambiguities"),
  };
}

async function interpretWithProvider(
  brief: string,
  provider: AiProviderConfig
): Promise<CreativeDirection> {
  const content = await generateStructuredText(provider, SYSTEM_PROMPT, brief);
  return parseProviderDirection(content);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Interpret a plain-English brief into a structured CreativeDirection.
 * Uses GPT-4o when an API key is provided, falls back to deterministic on any error.
 */
export async function interpretPrompt(
  brief: string,
  provider?: AiProviderConfig
): Promise<CreativeDirection> {
  if (!provider) return interpretDeterministic(brief);

  try {
    return await interpretWithProvider(brief, provider);
  } catch (error) {
    if (provider.source === "session") throw error;
  }

  return interpretDeterministic(brief);
}
