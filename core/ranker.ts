import type {
  ReferenceFile,
  ReferenceFeatures,
  RankedReference,
  CreativeDirection,
  CreativeConstraint,
  ScoringWeights,
  ScoreBreakdown,
} from "./types";
import { rgbToHsl } from "./analyzers/utils";

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
  if (direction.colors.length === 0) return 0.5;
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
 * Score how well the file name and extracted text match the subject/format terms.
 * Tokenises the filename properly and awards partial credit per matched term.
 * Returns 0–1.
 */
function scorePromptRelevance(
  file: ReferenceFile,
  features: ReferenceFeatures,
  direction: CreativeDirection
): number {
  if (direction.subject.length === 0 && direction.formats.length === 0) return 0.5;

  const targets = [...direction.subject, ...direction.formats].map((t) => t.toLowerCase());

  // Tokenise the filename: strip extension, split on non-alpha, lowercase
  const nameTokens = file.filename
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const corpus = [...nameTokens, ...features.extractedText.map((t) => t.toLowerCase())];
  corpus.push(...(features.semanticTags ?? []).map((tag) => tag.toLowerCase()));
  if (features.semanticDescription) {
    corpus.push(...features.semanticDescription.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  }

  let matched = 0;
  for (const target of targets) {
    const targetTokens = target.split(/\s+/);
    // Full match: all tokens of the target appear somewhere in the corpus
    const fullMatch = targetTokens.every((tt) => corpus.some((c) => c === tt || c.includes(tt)));
    // Partial credit: any single token matches
    const partialMatch = targetTokens.some((tt) => corpus.some((c) => c === tt || c.includes(tt)));
    matched += fullMatch ? 1 : partialMatch ? 0.4 : 0;
  }

  return targets.length === 0 ? 0.5 : Math.min(1, matched / targets.length);
}

// ─────────────────────────────────────────────────────────────────────────────
// Visual feature → mood/style mappings
// Lets images without extracted text still score well on semantic match.
// ─────────────────────────────────────────────────────────────────────────────

/** Map mood terms to the visual feature signatures they imply. */
const MOOD_TO_VISUAL: Record<string, (f: ReferenceFeatures) => number> = {
  dark:      (f) => f.brightness < 0.35 ? 1 : f.brightness < 0.5 ? 0.5 : 0,
  bright:    (f) => f.brightness > 0.65 ? 1 : f.brightness > 0.5 ? 0.5 : 0,
  calm:      (f) => {
    const ed = f.edgeDensity ?? 0.3;
    return f.contrast < 0.35 && f.saturation < 0.4 && ed < 0.25 ? 1 : f.contrast < 0.5 ? 0.5 : 0;
  },
  energetic: (f) => {
    const ed = f.edgeDensity ?? 0.3;
    return f.contrast > 0.55 && f.saturation > 0.45 && ed > 0.35 ? 1 : f.contrast > 0.4 ? 0.5 : 0;
  },
  warm:      (f) => {
    if (f.colors.length === 0) return 0.3;
    const warm = f.colors.filter((c) => { const [h] = rgbToHsl(c.rgb[0], c.rgb[1], c.rgb[2]); return (h <= 60) || h >= 300; });
    return warm.length / f.colors.length;
  },
  playful:   (f) => f.saturation > 0.5 && f.brightness > 0.5 ? 1 : f.saturation > 0.35 ? 0.5 : 0,
  serious:   (f) => f.saturation < 0.3 || f.brightness < 0.4 ? 0.8 : 0.2,
  nostalgic: (f) => f.saturation < 0.45 && f.brightness > 0.4 ? 0.7 : 0.3,
  romantic:  (f) => f.brightness > 0.55 && f.saturation > 0.25 ? 0.7 : 0.3,
  mysterious: (f) => f.brightness < 0.5 && f.contrast > 0.35 ? 0.85 : f.contrast > 0.45 ? 0.55 : 0.25,
  haunting: (f) => f.brightness < 0.38 && f.contrast > 0.45 && f.saturation < 0.5 ? 0.9 : 0.3,
  melancholic: (f) => f.brightness < 0.48 && f.saturation < 0.5 ? 0.85 : f.brightness < 0.6 ? 0.55 : 0.25,
  contemplative: (f) => f.contrast < 0.45 && f.saturation < 0.45 && (f.edgeDensity ?? 0.3) < 0.35 ? 0.85 : 0.35,
  dramatic:  (f) => f.contrast > 0.6 ? 1 : f.contrast > 0.45 ? 0.5 : 0,
  "awe-inspiring": (f) => {
    const ed = f.edgeDensity ?? 0.3;
    return f.contrast > 0.55 && (f.saturation > 0.35 || f.brightness < 0.4) && ed > 0.3 ? 1 : f.contrast > 0.4 ? 0.6 : 0.2;
  },
  inspiring: (f) => f.contrast > 0.45 && f.brightness > 0.45 ? 0.9 : f.brightness > 0.35 ? 0.55 : 0.25,
  wonder: (f) => f.contrast > 0.4 && (f.saturation > 0.25 || f.brightness > 0.6) ? 0.85 : 0.35,
  uplifting: (f) => f.brightness > 0.58 && f.contrast > 0.3 ? 0.9 : f.brightness > 0.45 ? 0.55 : 0.2,
  hopeful: (f) => f.brightness > 0.55 && f.saturation > 0.2 ? 0.85 : f.brightness > 0.42 ? 0.55 : 0.25,
  aspirational: (f) => f.brightness > 0.45 && f.contrast > 0.4 ? 0.8 : 0.35,
  empowering: (f) => f.contrast > 0.5 && f.saturation > 0.3 ? 0.9 : f.contrast > 0.35 ? 0.55 : 0.25,
  visionary: (f) => (f.edgeDensity ?? 0.3) > 0.35 && f.contrast > 0.45 ? 0.85 : 0.35,
  epic: (f) => f.contrast > 0.5 && (f.edgeDensity ?? 0.3) > 0.3 ? 0.9 : f.contrast > 0.35 ? 0.55 : 0.25,
  grand: (f) => f.contrast > 0.45 && ((f.edgeDensity ?? 0.3) > 0.25 || f.aspectRatio > 1.2) ? 0.85 : 0.35,
  majestic: (f) => f.contrast > 0.4 && f.brightness > 0.35 ? 0.85 : 0.35,
  breathtaking: (f) => f.contrast > 0.55 && (f.brightness > 0.5 || f.saturation > 0.45) ? 0.95 : 0.3,
  sublime: (f) => f.contrast > 0.4 && f.saturation < 0.7 ? 0.8 : 0.35,
  transcendent: (f) => f.brightness > 0.55 && f.contrast > 0.4 ? 0.85 : 0.3,
  powerful: (f) => f.contrast > 0.55 ? 0.9 : f.contrast > 0.4 ? 0.55 : 0.25,
  striking: (f) => f.contrast > 0.6 || f.saturation > 0.65 ? 0.9 : f.contrast > 0.45 ? 0.55 : 0.25,
  raw: (f) => f.contrast > 0.5 && (f.edgeDensity ?? 0.3) > 0.3 ? 0.85 : f.contrast > 0.4 ? 0.55 : 0.3,
  rebellious: (f) => f.contrast > 0.55 && ((f.edgeDensity ?? 0.3) > 0.35 || f.saturation > 0.6) ? 0.9 : 0.35,
  edgy: (f) => f.contrast > 0.55 || (f.edgeDensity ?? 0.3) > 0.5 ? 0.85 : 0.35,
  confident: (f) => f.contrast > 0.45 && f.saturation > 0.3 ? 0.8 : 0.35,
  enchanting: (f) => f.saturation > 0.3 && f.brightness > 0.45 ? 0.8 : 0.35,
  ethereal: (f) => f.brightness > 0.62 && f.saturation < 0.45 ? 0.85 : 0.3,
  intimate: (f) => f.subjectPlacement === "center" && f.contrast < 0.5 ? 0.85 : 0.35,
  tender: (f) => f.contrast < 0.4 && f.brightness > 0.4 ? 0.8 : 0.3,
  sensual: (f) => f.saturation > 0.3 && f.saturation < 0.75 && f.brightness > 0.3 ? 0.8 : 0.3,
  dreamy: (f) => f.brightness > 0.55 && f.contrast < 0.45 ? 0.85 : 0.3,
  soft: (f) => f.contrast < 0.3 && f.saturation < 0.55 ? 0.85 : 0.35,
  elegant: (f) => f.contrast > 0.3 && f.contrast < 0.65 && f.saturation < 0.65 ? 0.8 : 0.35,
  luxurious: (f) => f.brightness > 0.3 && f.brightness < 0.75 && f.saturation > 0.2 ? 0.8 : 0.35,
  sophisticated: (f) => f.contrast > 0.3 && f.contrast < 0.65 && f.saturation < 0.55 ? 0.85 : 0.35,
  refined: (f) => f.contrast > 0.3 && f.contrast < 0.6 && f.saturation < 0.5 ? 0.8 : 0.35,
  futuristic: (f) => f.contrast > 0.45 && (f.edgeDensity ?? 0.3) > 0.3 ? 0.8 : 0.35,
  organic: (f) => f.saturation > 0.15 && f.saturation < 0.65 && (f.edgeDensity ?? 0.3) > 0.15 ? 0.8 : 0.35,
  earthy: (f) => f.saturation < 0.55 && f.brightness > 0.25 && f.brightness < 0.7 ? 0.8 : 0.35,
  grounded: (f) => f.brightness > 0.25 && f.brightness < 0.65 && f.contrast < 0.55 ? 0.8 : 0.35,
  authentic: (f) => !f.isIllustrative && (f.edgeDensity ?? 0.3) > 0.2 ? 0.75 : 0.35,
  radiant: (f) => f.brightness > 0.65 && f.saturation > 0.3 ? 0.9 : f.brightness > 0.5 ? 0.55 : 0.2,
  celebratory: (f) => f.brightness > 0.55 && f.saturation > 0.5 ? 0.9 : 0.3,
  joyful: (f) => f.brightness > 0.55 && f.saturation > 0.45 ? 0.9 : 0.35,
  moody:     (f) => f.brightness < 0.45 && f.contrast > 0.4 ? 1 : 0.3,
  gritty:    (f) => {
    const ed = f.edgeDensity ?? 0.3;
    return f.contrast > 0.5 && f.saturation < 0.4 && ed > 0.3 ? 1 : f.contrast > 0.5 ? 0.6 : 0.3;
  },
};

/** Map style terms to visual feature signatures. */
const STYLE_TO_VISUAL: Record<string, (f: ReferenceFeatures) => number> = {
  minimalist:    (f) => {
    const ed = f.edgeDensity ?? 0.3;
    return f.contrast < 0.4 && f.saturation < 0.35 && ed < 0.2 ? 1 : f.subjectPlacement === "center" ? 0.5 : 0.2;
  },
  editorial:     (f) => (f.subjectPlacement === "top" || f.subjectPlacement === "center") && f.contrast > 0.35 ? 0.8 : 0.4,
  photographic:  (f) => !f.isIllustrative ? 0.9 : 0.1,
  cinematic:     (f) => !f.isIllustrative && f.contrast > 0.4 && f.saturation < 0.75 ? 0.85 : 0.3,
  illustrative:  (f) => f.isIllustrative ? 1 : 0,
  geometric:     (f) => f.isIllustrative && f.contrast > 0.4 ? 0.8 : 0.3,
  retro:         (f) => f.saturation < 0.5 && f.brightness > 0.4 && f.brightness < 0.7 ? 0.7 : 0.3,
  experimental:  (f) => {
    const ed = f.edgeDensity ?? 0.3;
    return f.subjectPlacement === "distributed" || f.contrast > 0.6 || ed > 0.5 ? 0.7 : 0.3;
  },
  handmade:      (f) => f.isIllustrative && f.saturation > 0.2 ? 0.7 : 0.3,
  typographic:   (f) => f.hasText ? 0.9 : 0.1,
  busy:          (f) => (f.edgeDensity ?? 0.3) > 0.45 ? 0.9 : 0.2,
  complex:       (f) => (f.edgeDensity ?? 0.3) > 0.4 && f.contrast > 0.4 ? 0.85 : 0.25,
  clean:         (f) => (f.edgeDensity ?? 0.3) < 0.2 && f.saturation < 0.4 ? 0.9 : 0.3,
  flat:          (f) => f.isIllustrative && (f.edgeDensity ?? 0.3) < 0.25 ? 1 : 0.2,
};

/**
 * Score semantic alignment: extracted text for text-bearing files, visual
 * feature matching for images/SVGs. Returns 0–1.
 */
function scoreSemanticMatch(
  features: ReferenceFeatures,
  direction: CreativeDirection
): number {
  const targets = [...direction.mood, ...direction.style, ...direction.audience];
  if (targets.length === 0) return 0.5;

  let totalScore = 0;
  let checks = 0;

  for (const target of targets) {
    const t = target.toLowerCase();

    // 1. Check provider semantic evidence first when available.
    if (features.semanticMatch !== undefined && features.semanticConfidence !== undefined) {
      totalScore += features.semanticMatch;
      checks++;
      continue;
    }

    // 2. Check extracted text (strongest deterministic signal)
    if (features.extractedText.length > 0) {
      if (features.extractedText.some((w) => w.includes(t))) {
        totalScore += 1;
        checks++;
        continue;
      }
    }

    // 3. Map mood/style to visual features for image-heavy libraries
    const moodFn = MOOD_TO_VISUAL[t];
    if (moodFn) {
      totalScore += moodFn(features);
      checks++;
      continue;
    }
    const styleFn = STYLE_TO_VISUAL[t];
    if (styleFn) {
      totalScore += styleFn(features);
      checks++;
      continue;
    }

    // 4. No mapping — neutral rather than zero (avoids penalising unrecognised terms)
    totalScore += 0.3;
    checks++;
  }

  return checks === 0 ? 0.5 : Math.min(1, totalScore / checks);
}

/**
 * Score visual fit based on orientation, composition, aspect ratio, and mood
 * against the requested format and style.
 * Returns 0–1.
 */
function scoreVisualFit(
  features: ReferenceFeatures,
  direction: CreativeDirection,
  requestedFormats: string[],
  constraints: CreativeConstraint[]
): number {
  // Start neutral; earn score rather than lose it
  let score = 0.35;
  const formats = requestedFormats;
  const hasFormat = formats.length > 0;

  // ── Orientation × format ────────────────────────────────────────────────
  if (hasFormat) {
    if ((formats.includes("poster") || formats.includes("print") || formats.includes("editorial")) && features.orientation === "portrait") {
      score += 0.3;
    } else if ((formats.includes("website") || formats.includes("screen")) && features.orientation === "landscape") {
      score += 0.25;
    } else if (formats.includes("social")) {
      score += features.orientation === "square" ? 0.2 : 0.1;
    } else if (formats.includes("logo")) {
      score += features.orientation === "square" ? 0.2 : features.isIllustrative ? 0.15 : 0.05;
    } else if (formats.includes("branding")) {
      score += features.isIllustrative ? 0.2 : 0.1;
    }
  } else {
    // No format specified — mild bonus for high-quality composition
    score += features.fileQualityScore * 0.1;
  }

  const output = constraints.find((constraint) => constraint.type === "output")?.value;
  if (output === "print" && features.orientation === "portrait") score += 0.05;
  if (output === "screen" && features.orientation === "landscape") score += 0.05;

  // ── Style × placement ───────────────────────────────────────────────────
  if (direction.style.includes("editorial") || direction.style.includes("minimalist")) {
    if (features.subjectPlacement === "center" || features.subjectPlacement === "top") score += 0.1;
  }
  if (direction.style.includes("experimental")) {
    if (features.subjectPlacement === "distributed" || features.subjectPlacement === "left" || features.subjectPlacement === "right") score += 0.1;
  }

  // ── Mood × visual tone ──────────────────────────────────────────────────
  const ed = features.edgeDensity ?? 0.3;
  if (direction.mood.includes("dark") && features.brightness < 0.4) score += 0.1;
  if (direction.mood.includes("bright") && features.brightness > 0.6) score += 0.1;
  if (direction.mood.includes("calm") && features.contrast < 0.4 && ed < 0.3) score += 0.1;
  if (direction.mood.includes("energetic") && features.contrast > 0.5 && features.saturation > 0.4) score += 0.1;
  if (direction.mood.includes("minimalist") && features.saturation < 0.3 && ed < 0.25) score += 0.08;

  // ── Edge density × style bonus ─────────────────────────────────────────
  if (direction.style.includes("minimalist") && ed < 0.2) score += 0.08;
  if (direction.style.includes("busy") && ed > 0.45) score += 0.08;
  if (direction.style.includes("clean") && ed < 0.2) score += 0.08;

  // ── Illustrative bonus for branding/logo/typographic ───────────────────
  if (features.isIllustrative && (formats.includes("logo") || formats.includes("branding") || direction.style.includes("illustrative"))) {
    score += 0.1;
  }

  const aspectConstraint = constraints.find((constraint) => constraint.type === "aspectRatio");
  if (aspectConstraint) {
    const target = Number(aspectConstraint.value);
    if (Number.isFinite(target) && target > 0) {
      const relativeError = Math.abs(features.aspectRatio - target) / target;
      score += relativeError <= 0.12 ? 0.12 : relativeError <= 0.25 ? 0.04 : -0.08;
    }
  }

  const minResolution = constraints.find((constraint) => constraint.type === "minResolution");
  if (minResolution) {
    const match = String(minResolution.value).match(/(\d+)\s*[x×]\s*(\d+)/i);
    const requiredPixels = match ? Number(match[1]) * Number(match[2]) : Number(minResolution.value);
    if (Number.isFinite(requiredPixels) && requiredPixels > 0) {
      const actualPixels = features.widthPx * features.heightPx;
      score += actualPixels >= requiredPixels ? 0.08 : -0.08;
    }
  }

  const maxColors = constraints.find((constraint) => constraint.type === "maxColors");
  if (maxColors) {
    const limit = Number(maxColors.value);
    if (Number.isFinite(limit) && limit > 0) score += features.colors.length <= limit ? 0.06 : -0.06;
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
// Reason builder — context-aware: references the file's standing in the set
// ─────────────────────────────────────────────────────────────────────────────

function buildReasons(
  file: ReferenceFile,
  features: ReferenceFeatures,
  breakdown: ScoreBreakdown,
  direction: CreativeDirection,
  allFeatures: ReferenceFeatures[],
  requestedFormats: string[]
): string[] {
  const reasons: string[] = [];

  // ── Pre-compute relative standings across the analysed set ────────────────
  const brightnesses = allFeatures.map((f) => f.brightness).sort((a, b) => a - b);
  const saturations  = allFeatures.map((f) => f.saturation).sort((a, b) => a - b);
  const contrasts    = allFeatures.map((f) => f.contrast).sort((a, b) => a - b);
  const n = allFeatures.length;

  const brightnessRank = brightnesses.indexOf(features.brightness);
  const saturationRank = saturations.indexOf(features.saturation);
  const contrastRank   = contrasts.indexOf(features.contrast);

  const isHighestBrightness  = brightnessRank >= n - 2 && n >= 4;
  const isLowestBrightness   = brightnessRank <= 1 && n >= 4;
  const isHighestSaturation  = saturationRank >= n - 2 && n >= 4;
  const isLowestSaturation   = saturationRank <= 1 && n >= 4;
  const isHighestContrast    = contrastRank >= n - 2 && n >= 4;

  // ── 1. Color reason ───────────────────────────────────────────────────────
  if (features.colors.length > 0) {
    const warmColors = features.colors.filter((c) => {
      const [h] = rgbToHsl(c.rgb[0], c.rgb[1], c.rgb[2]);
      return (h >= 0 && h <= 60) || h >= 300;
    });
    const coolColors = features.colors.filter((c) => {
      const [h] = rgbToHsl(c.rgb[0], c.rgb[1], c.rgb[2]);
      return h >= 180 && h <= 270;
    });
    const wantWarm = direction.colors.includes("warm");
    const wantCool = direction.colors.includes("cool");

    if (isHighestSaturation) {
      const topColor = [...features.colors].sort((a, b) => {
        const [, sa] = rgbToHsl(a.rgb[0], a.rgb[1], a.rgb[2]);
        const [, sb] = rgbToHsl(b.rgb[0], b.rgb[1], b.rgb[2]);
        return sb - sa;
      })[0];
      reasons.push(`Most saturated palette in this set — dominant tone ${topColor?.hex ?? ""}.`);
    } else if (isLowestSaturation && features.saturation < 0.15) {
      reasons.push(`Near-monochrome palette (${Math.round(features.saturation * 100)}% avg saturation) — useful for tonal contrast studies.`);
    } else if (warmColors.length >= 2 && (wantWarm || direction.colors.length === 0)) {
      const sorted = [...warmColors].sort((a, b) => {
        const [, sa] = rgbToHsl(a.rgb[0], a.rgb[1], a.rgb[2]);
        const [, sb] = rgbToHsl(b.rgb[0], b.rgb[1], b.rgb[2]);
        return sb - sa;
      });
      reasons.push(`Warm palette matches brief — dominant tones ${sorted.slice(0, 2).map((c) => c.hex).join(" and ")}.`);
    } else if (coolColors.length >= 2 && (wantCool || direction.colors.length === 0)) {
      const sorted = [...coolColors].sort((a, b) => {
        const [, sa] = rgbToHsl(a.rgb[0], a.rgb[1], a.rgb[2]);
        const [, sb] = rgbToHsl(b.rgb[0], b.rgb[1], b.rgb[2]);
        return sb - sa;
      });
      reasons.push(`Cool palette — dominant tones ${sorted.slice(0, 2).map((c) => c.hex).join(" and ")}.`);
    } else if (features.colors[0]) {
      reasons.push(`Dominant colour ${features.colors[0].hex} at ${Math.round(features.brightness * 100)}% brightness.`);
    }
  }

  // ── 2. Composition / orientation ─────────────────────────────────────────
  if (features.orientation === "portrait" && requestedFormats.includes("poster")) {
    reasons.push("Portrait orientation is a direct match for the requested poster format.");
  } else if (features.orientation === "landscape" && requestedFormats.includes("website")) {
    reasons.push("Landscape orientation suits the requested web format.");
  } else if (isHighestContrast) {
    reasons.push(`Highest contrast of the set (${Math.round(features.contrast * 100)}%) — strongest layout separation reference.`);
  } else if (features.subjectPlacement !== "center") {
    const placementLabel: Record<string, string> = {
      top: "Subject anchored at the top — strong editorial entry point",
      bottom: "Subject grounded at the bottom — useful for text-above layouts",
      left: "Off-centre left — creates natural reading flow to the right",
      right: "Off-centre right — draws the eye against natural scan direction",
      distributed: "Full-frame distributed composition — no dominant focal zone",
    };
    const label = placementLabel[features.subjectPlacement] ?? "Asymmetric composition";
    reasons.push(`${label} (${features.aspectRatio.toFixed(2)} ratio).`);
  } else {
    const toneLabel =
      features.brightness > 0.65 ? "high-key" :
      features.brightness < 0.35 ? "low-key" : "mid-tone";
    reasons.push(`Centred ${features.orientation} composition, ${toneLabel} exposure (${features.aspectRatio.toFixed(2)} ratio).`);
  }

  // ── 3. Mood / visual tone match ───────────────────────────────────────────
  if (reasons.length < 3) {
    if (isHighestBrightness && direction.mood.includes("bright")) {
      reasons.push(`Brightest reference in this set — best match for the requested bright mood.`);
    } else if (isLowestBrightness && direction.mood.includes("dark")) {
      reasons.push(`Darkest reference in this set — strongest match for the requested dark mood.`);
    } else if (direction.mood.includes("calm") && features.contrast < 0.35 && features.saturation < 0.35) {
      reasons.push(`Low contrast (${Math.round(features.contrast * 100)}%) and low saturation support the requested calm mood.`);
    } else if (direction.mood.includes("energetic") && features.contrast > 0.5 && features.saturation > 0.4) {
      reasons.push(`High contrast and saturated palette match the requested energetic mood.`);
    } else if (direction.mood.includes("dramatic") && features.contrast > 0.55) {
      reasons.push(`Strong tonal contrast (${Math.round(features.contrast * 100)}%) reinforces a dramatic mood.`);
    } else if (features.contrast > 0.6 && reasons.length < 3) {
      reasons.push(`High contrast (${Math.round(features.contrast * 100)}%) — strong candidate for layout structure reference.`);
    }
  }

  // ── 4. Text semantic match ────────────────────────────────────────────────
  if (features.extractedText.length > 0 && breakdown.semanticMatch > 0.35 && reasons.length < 4) {
    const targets = [...direction.subject, ...direction.mood, ...direction.style];
    const matched = features.extractedText
      .filter((w) => targets.some((t) => w.includes(t.toLowerCase())))
      .slice(0, 2);
    if (matched.length > 0) {
      reasons.push(`Embedded text contains brief-relevant terms: "${matched.join('", "')}".`);
    }
  }

  // ── 5. Illustrative flag ──────────────────────────────────────────────────
  if (features.isIllustrative && reasons.length < 4) {
    const formatHint = requestedFormats.includes("logo") || requestedFormats.includes("branding")
      ? " — especially relevant for the requested format"
      : "";
    reasons.push(`Vector / illustrative format${formatHint}; scalable and style-transferable.`);
  }

  // ── 6. Low quality note ───────────────────────────────────────────────────
  if (features.fileQualityScore < 0.3 && reasons.length < 4) {
    reasons.push("Low-resolution source — use for concept or colour reference only.");
  }

  // AI evidence is reference-specific and must lead the card. Generic
  // palette/orientation heuristics remain useful supporting evidence, but
  // should never hide the analytical read that distinguishes this reference.
  const aiReasons = [
    features.semanticRationale
      ? `AI why: ${features.semanticRationale.replace(/[.\s]+$/, "")}.`
      : "",
    features.semanticEvidence?.length
      ? `AI evidence: ${features.semanticEvidence.slice(0, 2).join("; ")}.`
      : "",
    features.semanticDescription
      ? `AI observation: ${features.semanticDescription.replace(/[.\s]+$/, "")}.`
      : "",
    features.semanticTags?.length
      ? `AI signals: ${features.semanticTags.slice(0, 3).join(", ")}.`
      : "",
  ].filter(Boolean);

  return [...aiReasons, ...reasons]
    .filter((reason, index, values) => values.indexOf(reason) === index)
    .slice(0, 4);
}

/**
 * Estimate visual distance between two references using measurable signals.
 * It is used only to break near-ties, so strong brief matches still win.
 */
function visualDistance(a: RankedReference, b: RankedReference): number {
  const af = a.features;
  const bf = b.features;
  let distance = 0;

  distance += Math.min(1, Math.abs(af.brightness - bf.brightness)) * 0.2;
  distance += Math.min(1, Math.abs(af.saturation - bf.saturation)) * 0.15;
  distance += Math.min(1, Math.abs(af.contrast - bf.contrast)) * 0.15;
  distance += Math.min(1, Math.abs((af.edgeDensity ?? 0.3) - (bf.edgeDensity ?? 0.3))) * 0.15;
  distance += af.orientation === bf.orientation ? 0 : 0.12;
  distance += af.subjectPlacement === bf.subjectPlacement ? 0 : 0.08;
  distance += af.isIllustrative === bf.isIllustrative ? 0 : 0.1;

  const ah = af.colors[0] ? rgbToHsl(...af.colors[0].rgb)[0] : null;
  const bh = bf.colors[0] ? rgbToHsl(...bf.colors[0].rgb)[0] : null;
  if (ah !== null && bh !== null) {
    const hueDistance = Math.min(Math.abs(ah - bh), 360 - Math.abs(ah - bh)) / 180;
    distance += hueDistance * 0.05;
  }

  return Math.min(1, distance);
}

/**
 * Apply a mild maximal-marginal-relevance pass. Vague briefs have little
 * metadata to distinguish candidates, so near-tied results should show a
 * range of visual directions instead of six copies of the same treatment.
 */
function diversifyNearTies(
  results: RankedReference[],
  direction: CreativeDirection
): RankedReference[] {
  if (results.length < 3) return results;

  const hasSemanticEvidence = results.some((reference) =>
    reference.features.semanticTags?.length || reference.features.semanticDescription
  );
  const hasExplicitBriefSignals = direction.subject.length > 0 || direction.formats.length > 0 || hasSemanticEvidence;
  const diversityWeight = hasExplicitBriefSignals ? 0.12 : 0.3;
  const pinned = results.filter((reference) => reference.isPinned);
  const remaining = results.filter((reference) => !reference.isPinned);
  const selected = [...pinned];

  while (remaining.length > 0) {
    const bestScore = remaining[0]?.score ?? 0;
    const nearTies = remaining.filter((reference) => reference.score >= bestScore - 0.12);
    const pool = nearTies.length > 0 ? nearTies : remaining;

    const next = pool.reduce((best, candidate) => {
      const diversity = selected.length === 0
        ? 0.5
        : Math.min(...selected.map((reference) => visualDistance(candidate, reference)));
      const candidateValue = candidate.score * (1 - diversityWeight) + diversity * diversityWeight;
      const bestDiversity = selected.length === 0
        ? 0.5
        : Math.min(...selected.map((reference) => visualDistance(best, reference)));
      const bestValue = best.score * (1 - diversityWeight) + bestDiversity * diversityWeight;
      return candidateValue > bestValue ? candidate : best;
    }, pool[0]);

    selected.push(next);
    const index = remaining.indexOf(next);
    if (index >= 0) remaining.splice(index, 1);
  }

  return selected;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate that scoring weights sum to 1.0 (±0.01 tolerance).
 */
export function validateWeights(weights: ScoringWeights): void {
  const values = Object.values(weights);
  if (
    values.length !== 5 ||
    values.some((value) => !Number.isFinite(value) || value < 0 || value > 1)
  ) {
    throw new Error("Scoring weights must be finite numbers between 0 and 1.");
  }

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
  removedIds: Set<string> = new Set(),
  constraints: CreativeConstraint[] = []
): RankedReference[] {
  validateWeights(weights);

  const constrainedFormats = constraints
    .filter((constraint) => constraint.type === "format" && String(constraint.value) !== "any")
    .map((constraint) => String(constraint.value));
  const requestedFormats = [...new Set(constrainedFormats.length > 0 ? constrainedFormats : direction.formats)];

  // Collect all features upfront for relative-standing comparisons
  const allFeaturesList: ReferenceFeatures[] = [];
  for (const file of files) {
    if (removedIds.has(file.id)) continue;
    const f = featuresMap.get(file.id);
    if (f) allFeaturesList.push(f);
  }

  const results: RankedReference[] = [];

  for (const file of files) {
    if (removedIds.has(file.id)) continue;

    const features = featuresMap.get(file.id);
    if (!features) continue;

    const promptRelevance   = scorePromptRelevance(file, features, direction);
    const semanticMatch     = scoreSemanticMatch(features, direction);
    const visualFit         = scoreVisualFit(features, direction, requestedFormats, constraints);
    const colorSuitability  = scoreColorSuitability(features, direction);
    const fileQuality       = scoreFileQuality(features);

    const total =
      promptRelevance   * weights.promptRelevance +
      semanticMatch     * weights.semanticMatch +
      visualFit         * weights.visualFit +
      colorSuitability  * weights.colorSuitability +
      fileQuality       * weights.fileQuality;

    const breakdown: ScoreBreakdown = {
      promptRelevance,
      semanticMatch,
      visualFit,
      colorSuitability,
      fileQuality,
      total,
    };

    const reasons = buildReasons(file, features, breakdown, direction, allFeaturesList, requestedFormats);
    const hasMetadataEvidence = breakdown.promptRelevance > 0.15 &&
      (direction.subject.length > 0 || requestedFormats.length > 0);
    const hasSemanticEvidence = Boolean(
      features.semanticTags?.length || features.semanticDescription || features.semanticMatch !== undefined
    );
    const matchBasis: RankedReference["matchBasis"] = [
      ...(hasSemanticEvidence ? ["semantic" as const] : []),
      ...(hasMetadataEvidence ? ["metadata" as const] : []),
      "visual",
    ];
    const matchConfidence = Math.min(1, Math.max(0.2,
      (hasSemanticEvidence ? (features.semanticConfidence ?? 0.7) * 0.55 : 0) +
      (hasMetadataEvidence ? Math.min(1, breakdown.promptRelevance + 0.2) * 0.25 : 0) +
      0.2
    ));

    results.push({
      file,
      features,
      score: total,
      scoreBreakdown: breakdown,
      reasons,
      matchBasis,
      matchConfidence,
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

  return diversifyNearTies(results, direction);
}
