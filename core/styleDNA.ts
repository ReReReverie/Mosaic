import type { RankedReference, StyleDNA, ColorSample } from "./types";
import { rgbToHsl } from "./analyzers/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Style DNA Analyzer
// Aggregates the visual characteristics of the selected references.
// ─────────────────────────────────────────────────────────────────────────────

const OVERREPRESENTED_THRESHOLD = 0.6; // 60% majority triggers a flag

/**
 * Count how many references satisfy a predicate and return the fraction.
 */
function fraction(
  refs: RankedReference[],
  pred: (r: RankedReference) => boolean
): number {
  if (refs.length === 0) return 0;
  return refs.filter(pred).length / refs.length;
}

/**
 * Aggregate all dominant colors across references and return the top N by frequency.
 */
function aggregateColors(
  refs: RankedReference[],
  topN = 5
): ColorSample[] {
  // Collect all hex values with a simple bin-count
  const freq = new Map<string, { color: ColorSample; count: number }>();
  for (const ref of refs) {
    for (const c of ref.features.colors) {
      const existing = freq.get(c.hex);
      if (existing) {
        existing.count++;
        if (!existing.color.sourceReferenceIds.includes(ref.file.id)) {
          existing.color.sourceReferenceIds.push(ref.file.id);
        }
      } else {
        freq.set(c.hex, {
          color: { ...c, sourceReferenceIds: [ref.file.id] },
          count: 1,
        });
      }
    }
  }

  return [...freq.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, topN)
    .map(({ color }) => color);
}

/**
 * Build a natural-language design-crit summary from measured values.
 * Always template-based — never LLM-generated.
 */
function buildSummary(
  refs: RankedReference[],
  dominantOrientation: StyleDNA["dominantOrientation"],
  brightness: number,
  saturation: number,
  contrast: number,
  overrepresented: string[]
): string {
  const n = refs.length;
  const illustrativeFraction = fraction(refs, (r) => r.features.isIllustrative);
  const illustrativeCount = Math.round(illustrativeFraction * n);

  // ── Tone sentence ─────────────────────────────────────────────────────────
  const brightWord = brightness > 0.65 ? "high-key" : brightness < 0.35 ? "low-key" : "mid-toned";
  const satWord    = saturation > 0.55  ? "richly saturated" : saturation < 0.25 ? "desaturated" : "moderately saturated";
  const contWord   = contrast > 0.55    ? "high contrast" : contrast < 0.25 ? "very soft contrast" : "moderate contrast";

  const toneSentence = `This board leans ${brightWord} and ${satWord}, with ${contWord} overall.`;

  // ── Orientation sentence ──────────────────────────────────────────────────
  let orientSentence = "";
  if (dominantOrientation !== "mixed") {
    const orientWord = dominantOrientation === "portrait" ? "portrait" : dominantOrientation === "landscape" ? "landscape" : "square";
    const orientCount = refs.filter((r) => r.features.orientation === dominantOrientation).length;
    orientSentence = ` ${orientCount} of ${n} references are ${orientWord}-oriented.`;
  } else {
    orientSentence = ` Orientation is mixed across the set — good for flexible cropping.`;
  }

  // ── Medium sentence ───────────────────────────────────────────────────────
  let mediumSentence = "";
  if (illustrativeFraction > 0.6) {
    mediumSentence = ` ${illustrativeCount} of ${n} are illustrative or vector — expect a graphic, constructed aesthetic.`;
  } else if (illustrativeFraction > 0.2) {
    mediumSentence = ` Mix of ${illustrativeCount} illustrative and ${n - illustrativeCount} photographic references.`;
  } else {
    mediumSentence = ` ${n - illustrativeCount} of ${n} are photographic — grounded in real-world texture and light.`;
  }

  // ── Overrepresentation warning ────────────────────────────────────────────
  let warningSentence = "";
  if (overrepresented.length === 1) {
    warningSentence = ` Watch out: ${overrepresented[0]} dominates the board.`;
  } else if (overrepresented.length > 1) {
    warningSentence = ` Overrepresented patterns — ${overrepresented.slice(0, 2).join(" and ")} — may narrow the creative range.`;
  }

  return `${toneSentence}${orientSentence}${mediumSentence}${warningSentence}`;
}

export function analyzeStyleDNA(refs: RankedReference[]): StyleDNA {
  if (refs.length === 0) {
    return {
      summary: "No references selected.",
      colors: [],
      composition: [],
      lighting: [],
      texture: [],
      layout: [],
      overrepresentedPatterns: [],
      brightness: 0.5,
      saturation: 0.3,
      contrast: 0.5,
      dominantOrientation: "mixed",
    };
  }

  // Aggregate scalar metrics
  const brightness =
    refs.reduce((s, r) => s + r.features.brightness, 0) / refs.length;
  const saturation =
    refs.reduce((s, r) => s + r.features.saturation, 0) / refs.length;
  const contrast =
    refs.reduce((s, r) => s + r.features.contrast, 0) / refs.length;

  // Dominant orientation
  const orientCounts = { portrait: 0, landscape: 0, square: 0 };
  for (const r of refs) orientCounts[r.features.orientation]++;
  const maxCount = Math.max(...Object.values(orientCounts));
  const dominantEntry = (
    Object.entries(orientCounts) as [
      "portrait" | "landscape" | "square",
      number
    ][]
  ).find(([, v]) => v === maxCount);
  const dominantOrientation: StyleDNA["dominantOrientation"] =
    maxCount / refs.length >= OVERREPRESENTED_THRESHOLD
      ? (dominantEntry?.[0] ?? "mixed")
      : "mixed";

  // Detect overrepresented patterns
  const overrepresented: string[] = [];
  if (fraction(refs, (r) => r.features.brightness < 0.35) >= OVERREPRESENTED_THRESHOLD)
    overrepresented.push("dark backgrounds");
  if (fraction(refs, (r) => r.features.brightness > 0.65) >= OVERREPRESENTED_THRESHOLD)
    overrepresented.push("light backgrounds");
  if (fraction(refs, (r) => r.features.orientation === "portrait") >= OVERREPRESENTED_THRESHOLD)
    overrepresented.push("portrait orientation");
  if (fraction(refs, (r) => r.features.orientation === "landscape") >= OVERREPRESENTED_THRESHOLD)
    overrepresented.push("landscape orientation");
  if (fraction(refs, (r) => r.features.subjectPlacement === "center") >= OVERREPRESENTED_THRESHOLD)
    overrepresented.push("centered compositions");
  if (fraction(refs, (r) => r.features.isIllustrative) >= OVERREPRESENTED_THRESHOLD)
    overrepresented.push("illustrative style");
  if (fraction(refs, (r) => !r.features.isIllustrative) >= OVERREPRESENTED_THRESHOLD)
    overrepresented.push("photographic style");

  // Check warm/cool dominance in color palette
  const warmFraction = fraction(refs, (r) =>
    r.features.colors.some((c) => {
      const [h] = rgbToHsl(c.rgb[0], c.rgb[1], c.rgb[2]);
      return (h >= 0 && h <= 60) || h >= 300;
    })
  );
  if (warmFraction >= OVERREPRESENTED_THRESHOLD)
    overrepresented.push("warm color palette");
  const coolFraction = fraction(refs, (r) =>
    r.features.colors.some((c) => {
      const [h] = rgbToHsl(c.rgb[0], c.rgb[1], c.rgb[2]);
      return h >= 180 && h <= 270;
    })
  );
  if (coolFraction >= OVERREPRESENTED_THRESHOLD)
    overrepresented.push("cool color palette");

  // Composition patterns
  const compositions: string[] = [];
  if (fraction(refs, (r) => r.features.subjectPlacement === "center") > 0.5)
    compositions.push("centered subject placement");
  if (fraction(refs, (r) => r.features.contrast > 0.5) > 0.5)
    compositions.push("high-contrast compositions");
  if (fraction(refs, (r) => r.features.isIllustrative) > 0.3)
    compositions.push("illustrative elements");

  // Lighting patterns
  const lighting: string[] = [];
  if (brightness > 0.65) lighting.push("high-key lighting");
  else if (brightness < 0.35) lighting.push("low-key / dark");
  else lighting.push("balanced exposure");
  if (contrast > 0.5) lighting.push("strong contrast");

  const aggregatedColors = aggregateColors(refs, 5);

  const summary = buildSummary(
    refs,
    dominantOrientation,
    brightness,
    saturation,
    contrast,
    overrepresented
  );

  return {
    summary,
    colors: aggregatedColors,
    composition: compositions,
    lighting,
    texture: [],
    layout: [],
    overrepresentedPatterns: overrepresented,
    brightness,
    saturation,
    contrast,
    dominantOrientation,
  };
}
