import type { RankedReference, DiversitySuggestion, DiversityDimension } from "./types";
import { rgbToHsl } from "./analyzers/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Diversity Analyzer
// Clusters selected references by visual properties and detects overrepresentation.
// Recommends alternatives from the unselected pool (never from external sources).
// ─────────────────────────────────────────────────────────────────────────────

const OVERREPRESENTED_THRESHOLD = 0.6;
const MAX_SUGGESTIONS_PER_DIMENSION = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Feature vector builder
// Maps a reference to a normalized 7-dimensional vector over the diversity dimensions.
// ─────────────────────────────────────────────────────────────────────────────

export interface DiversityVector {
  id: string;
  /** 0 = light, 1 = dark */
  lightDark: number;
  /** 0 = warm, 1 = cool */
  warmCool: number;
  /** 0 = minimal, 1 = dense */
  densityScore: number;
  /** 0 = symmetrical, 1 = asymmetrical */
  asymmetry: number;
  /** 0 = portrait, 1 = landscape */
  orientationScore: number;
  /** 0 = photographic, 1 = illustrative */
  illustrativeScore: number;
  /** 0 = literal, 1 = abstract (proxy: low saturation + no text = more abstract) */
  abstractScore: number;
}

function buildVector(ref: RankedReference): DiversityVector {
  const f = ref.features;

  // lightDark: 1 - brightness (dark = 1)
  const lightDark = 1 - f.brightness;

  // warmCool: average coolness of dominant colors
  let totalCool = 0;
  for (const c of f.colors) {
    const [h] = rgbToHsl(c.rgb[0], c.rgb[1], c.rgb[2]);
    // Hue 180–270 = cool, else warm
    totalCool += h >= 180 && h <= 270 ? 1 : 0;
  }
  const warmCool = f.colors.length > 0 ? totalCool / f.colors.length : 0.5;

  // densityScore: contrast as a proxy for visual density
  const densityScore = f.contrast;

  // asymmetry: non-center placement = more asymmetrical
  const asymmetry = f.subjectPlacement === "center" ? 0 : 0.8;

  // orientationScore: 0 = portrait, 0.5 = square, 1 = landscape
  const orientationScore =
    f.orientation === "portrait" ? 0 : f.orientation === "landscape" ? 1 : 0.5;

  // illustrativeScore
  const illustrativeScore = f.isIllustrative ? 1 : 0;

  // abstractScore: low saturation + no text → more abstract
  const abstractScore = (1 - f.saturation) * (f.hasText ? 0.3 : 1.0);

  return {
    id: ref.file.id,
    lightDark,
    warmCool,
    densityScore,
    asymmetry,
    orientationScore,
    illustrativeScore,
    abstractScore,
  };
}

function vectorValues(v: DiversityVector): number[] {
  return [
    v.lightDark,
    v.warmCool,
    v.densityScore,
    v.asymmetry,
    v.orientationScore,
    v.illustrativeScore,
    v.abstractScore,
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Simple 1D dimension analysis (no full k-means needed for 7 dimensions)
// ─────────────────────────────────────────────────────────────────────────────

interface DimensionSpec {
  dimension: DiversityDimension;
  field: keyof Omit<DiversityVector, "id">;
  highLabel: string;
  lowLabel: string;
}

const DIMENSIONS: DimensionSpec[] = [
  { dimension: "light-dark", field: "lightDark", highLabel: "dark backgrounds", lowLabel: "light backgrounds" },
  { dimension: "warm-cool", field: "warmCool", highLabel: "cool color palettes", lowLabel: "warm color palettes" },
  { dimension: "dense-minimal", field: "densityScore", highLabel: "dense, high-contrast compositions", lowLabel: "minimal, low-contrast compositions" },
  { dimension: "symmetrical-asymmetrical", field: "asymmetry", highLabel: "asymmetrical layouts", lowLabel: "symmetrical / centered layouts" },
  { dimension: "portrait-landscape", field: "orientationScore", highLabel: "landscape orientation", lowLabel: "portrait orientation" },
  { dimension: "photographic-illustrative", field: "illustrativeScore", highLabel: "illustrative style", lowLabel: "photographic style" },
  { dimension: "literal-abstract", field: "abstractScore", highLabel: "abstract compositions", lowLabel: "literal / representational compositions" },
];

/**
 * Analyze the selected set for overrepresented diversity dimensions.
 * Returns suggestions from the unselected pool only.
 */
export function analyzeDiversity(
  selected: RankedReference[],
  pool: RankedReference[]
): DiversitySuggestion[] {
  if (selected.length < 3) return []; // Not enough to assess diversity

  const selectedVectors = selected.map(buildVector);
  const unselected = pool.filter(
    (r) => !selected.some((s) => s.file.id === r.file.id)
  );

  const suggestions: DiversitySuggestion[] = [];

  for (const dim of DIMENSIONS) {
    const values = selectedVectors.map((v) => v[dim.field] as number);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;

    // Check for strong bias in either direction
    const highCount = values.filter((v) => v > 0.6).length;
    const lowCount = values.filter((v) => v < 0.4).length;
    const highFraction = highCount / values.length;
    const lowFraction = lowCount / values.length;

    if (highFraction >= OVERREPRESENTED_THRESHOLD) {
      // Overrepresented on the high side — suggest low-side alternatives
      const alternatives = unselected
        .map((r) => ({ r, vec: buildVector(r) }))
        .filter(({ vec }) => (vec[dim.field] as number) < 0.4)
        .sort(
          (a, b) =>
            (a.vec[dim.field] as number) - (b.vec[dim.field] as number)
        )
        .slice(0, MAX_SUGGESTIONS_PER_DIMENSION)
        .map(({ r }) => r.file.id);

      if (alternatives.length > 0) {
        suggestions.push({
          reason: `${highCount} of ${selected.length} selected references use ${dim.highLabel}. Consider these ${alternatives.length} alternatives to broaden the direction.`,
          referenceIds: alternatives,
          dimension: dim.dimension,
        });
      }
    } else if (lowFraction >= OVERREPRESENTED_THRESHOLD) {
      // Overrepresented on the low side — suggest high-side alternatives
      const alternatives = unselected
        .map((r) => ({ r, vec: buildVector(r) }))
        .filter(({ vec }) => (vec[dim.field] as number) > 0.6)
        .sort(
          (a, b) =>
            (b.vec[dim.field] as number) - (a.vec[dim.field] as number)
        )
        .slice(0, MAX_SUGGESTIONS_PER_DIMENSION)
        .map(({ r }) => r.file.id);

      if (alternatives.length > 0) {
        suggestions.push({
          reason: `${lowCount} of ${selected.length} selected references use ${dim.lowLabel}. Consider these ${alternatives.length} alternatives to broaden the direction.`,
          referenceIds: alternatives,
          dimension: dim.dimension,
        });
      }
    }
  }

  return suggestions;
}
