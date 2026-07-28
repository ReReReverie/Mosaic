import type { AiProviderConfig } from "./aiProvider";
import { generateStructuredText } from "./aiProvider";
import { parseStructuredObject } from "./structuredJson";
import {
  ANALYZER_DIMENSIONS,
  ANALYZER_DIMENSION_LABELS,
  type AnalyzerDimension,
  type PromptAnalysis,
  type PromptDimension,
} from "./types";
import {
  COLOR_DIRECTION_TERMS,
  CONFLICTING_PAIRS,
  COMPOSITION_TERMS,
  LIGHTING_TERMS,
  MATERIAL_TERMS,
  MOOD_TERMS,
  POSE_TERMS,
  STYLE_TERMS,
  SUBJECT_TERMS,
} from "./keywords";

export const DEFAULT_PROMPT_PROFILE: Readonly<Record<AnalyzerDimension, readonly string[]>> = {
  subject: ["clear primary subject or focal motif"],
  poseGesture: ["readable, intentional gesture or stance"],
  lightingMood: ["balanced, readable lighting with a coherent mood"],
  palette: ["coherent, balanced palette"],
  materialTexture: ["visible, believable material and texture cues"],
  composition: ["intentional framing with a clear focal point"],
  styleRendering: ["consistent visual style and rendering"],
  other: [],
};

function matchTerms(text: string, dictionary: Record<string, string>): string[] {
  const found = new Set<string>();
  for (const [term, canonical] of Object.entries(dictionary)) {
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escapedTerm}\\b`, "i").test(text)) found.add(canonical);
  }
  return [...found];
}

function uniqueStrings(values: string[], limit = 4): string[] {
  return [...new Set(
    values
      .map((value) => value.trim().replace(/\s+/g, " "))
      .filter(Boolean)
      .map((value) => value.slice(0, 280))
  )].slice(0, limit);
}

function detectPromptAmbiguities(brief: string): string[] {
  return CONFLICTING_PAIRS.flatMap(([groupA, groupB]) => {
    const match = (terms: string[]) => terms.find((term) => {
      const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`\\b${escapedTerm}\\b`, "i").test(brief);
    });
    const first = match(groupA);
    const second = match(groupB);
    return first && second
      ? [`Conflicting signals detected: "${first}" and "${second}" suggest opposing directions. Preserve both deliberately or choose one as the primary direction.`]
      : [];
  });
}

function dimensionDetails(brief: string): Partial<Record<AnalyzerDimension, string[]>> {
  const text = brief.toLowerCase();
  const mood = matchTerms(text, MOOD_TERMS).map((value) => `mood: ${value}`);
  const lighting = matchTerms(text, LIGHTING_TERMS).map((value) => `lighting: ${value}`);

  return {
    subject: matchTerms(text, SUBJECT_TERMS),
    poseGesture: matchTerms(text, POSE_TERMS),
    lightingMood: uniqueStrings([...lighting, ...mood]),
    palette: matchTerms(text, COLOR_DIRECTION_TERMS),
    materialTexture: matchTerms(text, MATERIAL_TERMS),
    composition: matchTerms(text, COMPOSITION_TERMS),
    styleRendering: matchTerms(text, STYLE_TERMS),
  };
}

function formatDimensionSummary(dimension: PromptDimension): string {
  const label = ANALYZER_DIMENSION_LABELS[dimension.dimension];
  return `${label.toLowerCase()} = ${dimension.details.join(", ")}`;
}

export function summarizePromptAnalysis(dimensions: PromptDimension[], ambiguities: string[] = []): string {
  const matched = dimensions.filter((dimension) => dimension.source === "prompt");
  const defaults = dimensions.filter((dimension) => dimension.source === "default");
  const matchedText = matched.length > 0
    ? `Prompt signals: ${matched.map(formatDimensionSummary).join("; ")}.`
    : "Prompt signals: none of the artist dimensions were explicitly matched.";
  const defaultText = defaults.length > 0
    ? ` Defaults applied: ${defaults.map(formatDimensionSummary).join("; ")}.`
    : " No defaults were needed.";
  const ambiguityText = ambiguities.length > 0
    ? ` Ambiguities: ${ambiguities.slice(0, 4).join(" ")}`
    : "";
  return `${matchedText}${defaultText}${ambiguityText}`;
}

export function buildPromptAnalysis(
  details: Partial<Record<AnalyzerDimension, string[]>>,
  ambiguities: string[] = []
): PromptAnalysis {
  const dimensions: PromptDimension[] = ANALYZER_DIMENSIONS.map((dimension) => {
    const matched = uniqueStrings(details[dimension] ?? []);
    return {
      dimension,
      details: matched.length > 0 ? matched : [...DEFAULT_PROMPT_PROFILE[dimension]],
      specified: matched.length > 0,
      source: matched.length > 0 ? "prompt" : "default",
    };
  });

  const other = uniqueStrings(details.other ?? []);
  if (other.length > 0) {
    dimensions.push({
      dimension: "other",
      details: other,
      specified: true,
      source: "prompt",
    });
  }

  return {
    summary: summarizePromptAnalysis(dimensions, ambiguities),
    dimensions,
  };
}

export function interpretPromptAnalysisDeterministic(brief: string): PromptAnalysis {
  return buildPromptAnalysis(dimensionDetails(brief), detectPromptAmbiguities(brief));
}

function providerDimensionValue(value: unknown): { details: string[]; specified?: boolean } {
  if (Array.isArray(value)) {
    return { details: uniqueStrings(value.filter((item): item is string => typeof item === "string")) };
  }
  if (typeof value === "string") return { details: uniqueStrings([value]) };
  if (!value || typeof value !== "object") return { details: [] };

  const object = value as { details?: unknown; values?: unknown; matches?: unknown; specified?: unknown };
  const rawDetails = object.details ?? object.values ?? object.matches;
  const details = Array.isArray(rawDetails)
    ? uniqueStrings(rawDetails.filter((item): item is string => typeof item === "string"))
    : typeof rawDetails === "string"
      ? uniqueStrings([rawDetails])
      : [];
  return {
    details,
    ...(typeof object.specified === "boolean" ? { specified: object.specified } : {}),
  };
}

function providerDimensions(parsed: Record<string, unknown>): Record<string, unknown> {
  const nested = parsed.promptAnalysis;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const dimensions = (nested as { dimensions?: unknown }).dimensions;
    if (dimensions && typeof dimensions === "object" && !Array.isArray(dimensions)) {
      return dimensions as Record<string, unknown>;
    }
  }

  const dimensions = parsed.dimensions;
  return dimensions && typeof dimensions === "object" && !Array.isArray(dimensions)
    ? dimensions as Record<string, unknown>
    : {};
}

function providerAmbiguities(parsed: Record<string, unknown>): string[] {
  const nested = parsed.promptAnalysis;
  const nestedAmbiguities = nested && typeof nested === "object" && !Array.isArray(nested)
    ? (nested as { ambiguities?: unknown }).ambiguities
    : undefined;
  const value = nestedAmbiguities ?? parsed.ambiguities;
  return Array.isArray(value)
    ? uniqueStrings(value.filter((item): item is string => typeof item === "string"), 4)
    : [];
}

/**
 * Merge validated provider judgments over deterministic matches and defaults.
 * Provider output never removes a deterministic prompt match or invents an
 * unsupported dimension key.
 */
export function normalizeProviderPromptAnalysis(
  parsed: Record<string, unknown>,
  brief: string
): PromptAnalysis {
  const deterministic = interpretPromptAnalysisDeterministic(brief);
  const provider = providerDimensions(parsed);
  const merged: Partial<Record<AnalyzerDimension, string[]>> = {};

  for (const dimension of ANALYZER_DIMENSIONS) {
    const deterministicDimension = deterministic.dimensions.find((item) => item.dimension === dimension);
    const deterministicDetails = deterministicDimension?.source === "prompt"
      ? deterministicDimension.details
      : [];
    const providerValue = providerDimensionValue(provider[dimension]);
    const providerDetails = providerValue.specified === false ? [] : providerValue.details;
    const details = uniqueStrings([...deterministicDetails, ...providerDetails]);
    if (details.length > 0) merged[dimension] = details;
  }

  const otherValue = providerDimensionValue(provider.other);
  if (otherValue.specified !== false && otherValue.details.length > 0) {
    merged.other = otherValue.details;
  }

  return buildPromptAnalysis(
    merged,
    [...detectPromptAmbiguities(brief), ...providerAmbiguities(parsed)].slice(0, 4),
  );
}

export function promptProfileForProvider(analysis: PromptAnalysis): string {
  return analysis.dimensions
    .map((dimension) => `${ANALYZER_DIMENSION_LABELS[dimension.dimension]} (${dimension.source}): ${dimension.details.join(", ")}`)
    .join("; ");
}

export const PROMPT_ANALYSIS_SYSTEM_PROMPT = `You are a visual art-direction analyst. Extract only the visual dimensions stated or strongly implied by a designer's brief.
Start from the project defaults supplied below. A dimension is prompt-specified only when the brief contains a concrete or strongly implied signal; otherwise return an empty list for that dimension and the application will keep its default.
Return only valid JSON with this shape:
{"dimensions":{"subject":[],"poseGesture":[],"lightingMood":[],"palette":[],"materialTexture":[],"composition":[],"styleRendering":[],"other":[]},"ambiguities":[]}
Use concise concrete details. Do not invent a subject, pose, lighting, palette, material, composition, or style that the brief does not support. Preserve conflicting signals in the relevant array and report the conflict in ambiguities.
Project defaults: ${Object.entries(DEFAULT_PROMPT_PROFILE)
  .filter(([, details]) => details.length > 0)
  .map(([dimension, details]) => `${ANALYZER_DIMENSION_LABELS[dimension as AnalyzerDimension]} = ${details.join(", ")}`)
  .join("; ")}.`;

export async function analyzePromptWithProvider(
  provider: AiProviderConfig,
  brief: string
): Promise<Record<string, unknown>> {
  const content = await generateStructuredText(
    provider,
    PROMPT_ANALYSIS_SYSTEM_PROMPT,
    brief.slice(0, 2_000)
  );
  return parseStructuredObject<Record<string, unknown>>(content);
}
