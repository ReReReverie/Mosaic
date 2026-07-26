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
// GPT-4o enhanced interpretation (optional — requires OPENAI_API_KEY)
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

async function interpretWithGPT(
  brief: string,
  apiKey: string
): Promise<CreativeDirection | null> {
  try {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey });

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: brief },
      ],
      temperature: 0,
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(content) as CreativeDirection;

    // Validate required fields are present
    const required: (keyof CreativeDirection)[] = [
      "subject", "audience", "mood", "style", "colors", "formats",
      "constraints", "ambiguities",
    ];
    for (const key of required) {
      if (!Array.isArray(parsed[key])) throw new Error(`Missing field: ${key}`);
    }

    return parsed;
  } catch {
    return null; // Silently fall back to deterministic
  }
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
  apiKey?: string
): Promise<CreativeDirection> {
  if (apiKey) {
    const gptResult = await interpretWithGPT(brief, apiKey);
    if (gptResult) return gptResult;
  }
  return interpretDeterministic(brief);
}
