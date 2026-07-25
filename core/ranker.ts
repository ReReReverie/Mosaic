import type {
  ReferenceFile,
  ReferenceFeatures,
  RankedReference,
  CreativeDirection,
  ScoringWeights,
  ScoreBreakdown,
} from "./types";
import { colorDistance, rgbToHsl } from "./analyzers/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Ranking Engine
// Scores references against a CreativeDirection and returns a sorted list.
// ─────────────────────────────────────────────────────────────────────────────

// Hue ranges for color direction matching (HSL hue 0–360)
const COLOR_HUE_RANGES: Record<string, [number, number][]> = {
  warm: [[0, 60], [300, 360]],
  cool: [[180, 270]],
  green: [[90, 150]],
  pastel: [], // handled by saturation
  muted: [],  // handled by saturation
  vibrant: [], // handled by saturation
  monochrome: [], // handled by saturation
};

/**
 * Score how well a reference's dominant colors match the requested color direction.
 * Returns 0–1.
 */
function scoreColorSuitability(
  features: ReferenceFeatures,
  direction: CreativeDirection
): number {
  if (direction.colors.length === 0) return 0.5; // no preference = neutral
  if (features.colors.length === 0) return 0.3;

  let score = 0;
  let checks = 0;

  for (const colorDir of direction.colors) {
    if (colorDir === "warm" || colorDir === "cool" || colorDir === "green") {
      const ranges = COLOR_HUE_RANGES[colorDir] ?? [];
      if (ranges.length > 0) {
        const matches = features.colors.filter((c) => {
          const [h] = rgbToHsl(c.rgb[0], c.rgb[1], c.rgb[2]);
          return ranges.some(([lo, hi]) => h >= lo && h <= hi);
        }).length;
        score += matches / features.colors.length;
        checks++;
      }
    } else if (colorDir === "muted" || colorDir === "pastel") {
      // Low saturation signal
      const matches = features.colors.filter((c) => {
        const [, s] = rgbToHsl(c.rgb[0], c.rgb[1], c.rgb[2]);
        return s < 0.4;
      }).length;
      score += matches / features.colors.length;
      checks++;
    } else if (colorDir === "vibrant") {
      const matches = features.colors.filter((c) => {
        const [, s] = rgbToHsl(c.rgb[0], c.rgb[1], c.rgb[2]);
        return s > 0.6;
      }).length;
      score += matches / features.colors.length;
      checks++;
    } else if (colorDir === "monochrome") {
      const matches = features.colors.filter((c) => {
        const [, s] = rgbToHsl(c.rgb[0], c.rgb[1], c.rgb[2]);
        return s < 0.15;
      }).length;
      score += matches / features.colors.length;
      checks++;
    }
  }

  return checks === 0 ? 0.5 : score / checks;
}

/**
 * Score how well the file name and extracted text match the subject terms.
 * Returns 0–1.
 */
function scorePromptRelevance(
  file: ReferenceFile,
  features: ReferenceFeatures,
  direction: CreativeDirection
): number {
  if (direction.subject.length === 0 && direction.formats.length === 0) return 0.5;

  const targets = [...direction.subject, ...direction.formats].map((t) =>
    t.toLowerCase()
  );
  const textCorpus = [
    file.filename.toLowerCase().replace(/[^a-z0-9 ]/g, " "),
    ...features.extractedText,
  ];

  let matches = 0;
  for (const target of targets) {
    if (textCorpus.some((t) => t.includes(target))) matches++;
  }

  return targets.length === 0 ? 0.5 : Math.min(1, matches / targets.length);
}

/**
 * Score how well extracted keywords match mood and style signals.
 * Returns 0–1.
 */
function scoreSemanticMatch(
  features: ReferenceFeatures,
  direction: CreativeDirection
): number {
  const targets = [...direction.mood, ...direction.style, ...direction.audience].map(
    (t) => t.toLowerCase()
  );
  if (targets.length === 0) return 0.5;

  const textCorpus = features.extractedText;
  let matches = 0;
  for (const target of targets) {
    if (textCorpus.some((t) => t.includes(target))) matches++;
  }

  return Math.min(1, matches / targets.length);
}

/**
 * Score visual fit based on orientation, composition, and aspect ratio against format.
 * Returns 0–1.
 */
function scoreVisualFit(
  features: ReferenceFeatures,
  direction: CreativeDirection
): number {
  let score = 0.5;
  const formats = direction.formats;

  // Orientation match
  if (
    (formats.includes("poster") || formats.includes("print")) &&
    features.orientation === "portrait"
  ) {
    score += 0.25;
  } else if (
    (formats.includes("website") || formats.includes("screen")) &&
    features.orientation === "landscape"
  ) {
    score += 0.2;
  } else if (formats.includes("social")) {
    // Social accepts both; square gets bonus
    if (features.orientation === "square") score += 0.1;
    else score += 0.05;
  }

  // Subject placement bonuses
  if (
    (direction.style.includes("editorial") || direction.style.includes("minimalist")) &&
    (features.subjectPlacement === "center" || features.subjectPlacement === "top")
  ) {
    score += 0.1;
  }

  return Math.min(1, score);
}

/**
 * Score file quality based on resolution proxy and quality score.
 */
function scoreFileQuality(features: ReferenceFeatures): number {
  return features.fileQualityScore;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reason builder — generates 2–4 specific evidence-based reason strings
// ─────────────────────────────────────────────────────────────────────────────

function buildReasons(
  file: ReferenceFile,
  features: ReferenceFeatures,
  breakdown: ScoreBreakdown,
  direction: CreativeDirection
): string[] {
  const reasons: string[] = [];

  // Color reasons
  if (features.colors.length > 0) {
    const warmColors = features.colors.filter((c) => {
      const [h] = rgbToHsl(c.rgb[0], c.rgb[1], c.rgb[2]);
      return (h >= 0 && h <= 60) || h >= 300;
    });
    const coolColors = features.colors.filter((c) => {
      const [h] = rgbToHsl(c.rgb[0], c.rgb[1], c.rgb[2]);
      return h >= 180 && h <= 270;
    });

    if (warmColors.length >= 2) {
      reasons.push(
        `Contains warm tones (${warmColors.slice(0, 2).map((c) => c.hex).join(", ")}).`
      );
    } else if (coolColors.length >= 2) {
      reasons.push(
        `Contains cool tones (${coolColors.slice(0, 2).map((c) => c.hex).join(", ")}).`
      );
    } else if (features.colors[0]) {
      reasons.push(`Dominant color: ${features.colors[0].hex}.`);
    }
  }

  // Orientation / composition reasons
  if (features.orientation === "portrait" && direction.formats.includes("poster")) {
    reasons.push("Portrait orientation matches the requested poster format.");
  } else if (features.orientation === "landscape" && direction.formats.includes("website")) {
    reasons.push("Landscape orientation suits the requested web format.");
  } else {
    const orientLabels: Record<string, string> = {
      portrait: "Portrait",
      landscape: "Landscape",
      square: "Square",
    };
    reasons.push(
      `${orientLabels[features.orientation]} composition (${features.aspectRatio.toFixed(2)} ratio).`
    );
  }

  // Text / semantic reasons
  if (features.extractedText.length > 0 && breakdown.semanticMatch > 0.3) {
    const matched = features.extractedText
      .filter((w) =>
        [...direction.subject, ...direction.mood, ...direction.style].some((t) =>
          w.includes(t.toLowerCase())
        )
      )
      .slice(0, 3);
    if (matched.length > 0) {
      reasons.push(
        `Extracted text includes relevant terms: "${matched.join('", "')}".`
      );
    }
  }

  // Contrast / brightness reasons
  if (features.contrast > 0.6) {
    reasons.push("High contrast makes this useful as a layout reference.");
  } else if (features.brightness > 0.7 && direction.mood.includes("bright")) {
    reasons.push("Bright, light composition matches the requested mood.");
  } else if (features.brightness < 0.35 && direction.mood.includes("dark")) {
    reasons.push("Dark tones align with the requested mood.");
  }

  // Illustrative flag
  if (features.isIllustrative) {
    reasons.push("Illustrative / vector format — useful for style reference.");
  }

  return reasons.slice(0, 4);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate that scoring weights sum to 1.0 (±0.01 tolerance).
 */
export function validateWeights(weights: ScoringWeights): void {
  const sum =
    weights.promptRelevance +
    weights.semanticMatch +
    weights.visualFit +
    weights.colorSuitability +
    weights.fileQuality;
  if (Math.abs(sum - 1) > 0.01) {
    throw new Error(
      `Scoring weights must sum to 1.0, got ${sum.toFixed(3)}.`
    );
  }
}

/**
 * Rank all references against a CreativeDirection using the provided weights.
 * Returns the full sorted list — callers apply the top-12 cutoff themselves.
 * Pinned references are moved to the top after sorting.
 */
export function rankReferences(
  files: ReferenceFile[],
  featuresMap: Map<string, ReferenceFeatures>,
  direction: CreativeDirection,
  weights: ScoringWeights,
  pinnedIds: Set<string> = new Set(),
  removedIds: Set<string> = new Set()
): RankedReference[] {
  validateWeights(weights);

  const results: RankedReference[] = [];

  for (const file of files) {
    if (removedIds.has(file.id)) continue;

    const features = featuresMap.get(file.id);
    if (!features) continue;

    const promptRelevance = scorePromptRelevance(file, features, direction);
    const semanticMatch = scoreSemanticMatch(features, direction);
    const visualFit = scoreVisualFit(features, direction);
    const colorSuitability = scoreColorSuitability(features, direction);
    const fileQuality = scoreFileQuality(features);

    const total =
      promptRelevance * weights.promptRelevance +
      semanticMatch * weights.semanticMatch +
      visualFit * weights.visualFit +
      colorSuitability * weights.colorSuitability +
      fileQuality * weights.fileQuality;

    const breakdown: ScoreBreakdown = {
      promptRelevance,
      semanticMatch,
      visualFit,
      colorSuitability,
      fileQuality,
      total,
    };

    const reasons = buildReasons(file, features, breakdown, direction);

    results.push({
      file,
      features,
      score: total,
      scoreBreakdown: breakdown,
      reasons,
      isPinned: pinnedIds.has(file.id),
      isRemoved: false,
      isTooSimilar: false,
    });
  }

  // Sort by score descending; pinned references float to the top
  results.sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return b.score - a.score;
  });

  return results;
}
