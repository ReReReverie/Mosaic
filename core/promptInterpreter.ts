import type { CreativeDirection, PromptAnalysis } from "./types";
import {
  MOOD_TERMS,
  STYLE_TERMS,
  AUDIENCE_TERMS,
  SUBJECT_TERMS,
  COLOR_DIRECTION_TERMS,
  FORMAT_TERMS,
  CONFLICTING_PAIRS,
  MOOD_EXPANSIONS,
} from "./keywords";
import type { AiProviderConfig } from "./aiProvider";
import { generateStructuredText } from "./aiProvider";
import { parseStructuredObject } from "./structuredJson";
import {
  normalizeProviderPromptAnalysis,
  interpretPromptAnalysisDeterministic,
  PROMPT_ANALYSIS_SYSTEM_PROMPT,
} from "./promptAnalysis";

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
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${escapedTerm}\\b`, "i");
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

/** Expand direct mood language into a bounded set of related creative signals. */
export function expandMoodTerms(moods: string[]): string[] {
  const expanded = [...moods];
  for (const mood of moods) {
    expanded.push(...(MOOD_EXPANSIONS[mood] ?? []));
  }
  return [...new Set(expanded)].slice(0, 10);
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
    mood: expandMoodTerms(matchTerms(text, MOOD_TERMS)),
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
  "ambiguities": string[],
  "dimensions": {
    "subject": string[],
    "poseGesture": string[],
    "lightingMood": string[],
    "palette": string[],
    "materialTexture": string[],
    "composition": string[],
    "styleRendering": string[],
    "other": string[]
  }
}
- subject: visual subjects (food, people, architecture, nature, products, etc.)
- audience: target audience descriptors
- mood: emotional tone and related signals (warm, calm, energetic, awe-inspiring, wonder, uplifting, hopeful, epic, dramatic, etc.)
- style: visual style (editorial, minimalist, experimental, retro, handmade, etc.)
- colors: color direction (warm, cool, muted, vibrant, monochrome, pastel, etc.)
- formats: output format (poster, logo, website, social, print, screen, etc.); return [] unless the brief explicitly names a format
- constraints: always empty array — do not add constraints
- ambiguities: any conflicting or unclear signals in the brief as plain strings
- dimensions: concrete visual details stated or strongly implied by the brief. Leave a dimension empty when the brief does not address it; the application supplies project defaults for empty dimensions. Do not copy the defaults into these arrays.
Use only values appropriate for the brief. Keep arrays concise (max 4 items each).`;

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function canonicalizeList(
  values: string[],
  dictionary: Record<string, string>,
  fallback: string[] = []
): string[] {
  const normalized = values.flatMap((value) => matchTerms(value.toLowerCase(), dictionary));
  return [...new Set([...normalized, ...fallback])].slice(0, 4);
}

/**
 * Normalize provider output against the same vocabulary used by the
 * deterministic interpreter. This prevents a provider from inventing a
 * format (for example "website") that the brief never requested.
 */
export function normalizeProviderDirection(
  parsed: Partial<CreativeDirection>,
  brief: string
): CreativeDirection {
  const deterministic = interpretDeterministic(brief);
  const explicitFormats = new Set(deterministic.formats);
  const providerFormats = canonicalizeList(stringList(parsed.formats), FORMAT_TERMS)
    .filter((format) => explicitFormats.has(format));
  const providerAmbiguities = stringList(parsed.ambiguities);

  return {
    subject: canonicalizeList(stringList(parsed.subject), SUBJECT_TERMS, deterministic.subject),
    audience: canonicalizeList(stringList(parsed.audience), AUDIENCE_TERMS, deterministic.audience),
    mood: expandMoodTerms(canonicalizeList(stringList(parsed.mood), MOOD_TERMS, deterministic.mood)),
    style: canonicalizeList(stringList(parsed.style), STYLE_TERMS, deterministic.style),
    colors: canonicalizeList(stringList(parsed.colors), COLOR_DIRECTION_TERMS, deterministic.colors),
    formats: [...new Set([...providerFormats, ...explicitFormats])].slice(0, 4),
    constraints: [],
    ambiguities: [...new Set([...deterministic.ambiguities, ...providerAmbiguities])].slice(0, 4),
  };
}

export function parseProviderDirection(content: string, brief: string): CreativeDirection {
  const parsed = parseStructuredObject<Partial<CreativeDirection>>(content);

  return normalizeProviderDirection(parsed, brief);
}

export interface PromptInterpretation {
  creativeDirection: CreativeDirection;
  promptAnalysis: PromptAnalysis;
}

function deterministicPromptInterpretation(brief: string): PromptInterpretation {
  return {
    creativeDirection: interpretDeterministic(brief),
    promptAnalysis: interpretPromptAnalysisDeterministic(brief),
  };
}

export function parseProviderInterpretation(
  content: string,
  brief: string
): PromptInterpretation {
  const parsed = parseStructuredObject<Record<string, unknown>>(content);
  return {
    creativeDirection: normalizeProviderDirection(parsed as Partial<CreativeDirection>, brief),
    promptAnalysis: normalizeProviderPromptAnalysis(parsed, brief),
  };
}

async function interpretWithProvider(
  brief: string,
  provider: AiProviderConfig
): Promise<PromptInterpretation> {
  const content = await generateStructuredText(
    provider,
    `${SYSTEM_PROMPT}\n\n${PROMPT_ANALYSIS_SYSTEM_PROMPT}`,
    brief.slice(0, 2_000)
  );
  return parseProviderInterpretation(content, brief);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Interpret a plain-English brief into a structured CreativeDirection.
 * Uses the configured provider when available, falling back to deterministic
 * interpretation on hosted-provider errors.
 */
export async function interpretPrompt(
  brief: string,
  provider?: AiProviderConfig
): Promise<CreativeDirection> {
  const interpretation = await interpretPromptBundle(brief, provider);
  return interpretation.creativeDirection;
}

/**
 * Interpret the legacy direction and the default-first artist dimensions in
 * one provider request so both views of the prompt stay consistent.
 */
export async function interpretPromptBundle(
  brief: string,
  provider?: AiProviderConfig
): Promise<PromptInterpretation> {
  if (!provider) return deterministicPromptInterpretation(brief);
  // Replicate is configured as Mosaic's image-analysis provider. Its selected
  // MiniCPM-V model should not receive a text-only brief request here.
  if (provider.provider === "replicate") return deterministicPromptInterpretation(brief);

  try {
    return await interpretWithProvider(brief, provider);
  } catch (error) {
    if (provider.source === "session") throw error;
  }

  return deterministicPromptInterpretation(brief);
}
