import type {
  RankedReference,
  PaletteSet,
  CreativeConstraint,
  AccessibilityFinding,
  ColorSample,
} from "./types";
import { contrastRatio } from "./paletteEngine";
import { rgbToHsl } from "./analyzers/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Accessibility Checker
// Evaluates selected references and palettes for practical design usability.
// ─────────────────────────────────────────────────────────────────────────────

// WCAG thresholds
const AA_NORMAL = 4.5;
const AA_LARGE = 3.0;
const AAA_NORMAL = 7.0;

// ─── Contrast checks ─────────────────────────────────────────────────────────

function checkPaletteContrast(
  palette: PaletteSet,
  constraints: CreativeConstraint[]
): AccessibilityFinding[] {
  const findings: AccessibilityFinding[] = [];
  const standard = constraints.find((c) => c.type === "accessibilityStandard")
    ?.value as string | undefined;
  const target = standard === "AAA" ? AAA_NORMAL : AA_NORMAL;

  for (const [key, p] of Object.entries(palette) as [
    keyof PaletteSet,
    PaletteSet[keyof PaletteSet]
  ][]) {
    const colors = p.colors;
    const bg = colors.find((c) => c.role === "background");
    const text = colors.find((c) => c.role === "text");

    if (bg && text) {
      const ratio = contrastRatio(bg.rgb, text.rgb);
      if (ratio < target) {
        findings.push({
          severity: ratio < AA_LARGE ? "error" : "warning",
          message: `Palette "${p.name}": text color ${text.hex} on background ${bg.hex} has a contrast ratio of ${ratio.toFixed(1)}:1, which fails WCAG ${standard ?? "AA"} (requires ${target}:1).`,
          affectedReferenceIds: [...text.sourceReferenceIds, ...bg.sourceReferenceIds],
          recommendation: `Darken the text color or lighten the background in the ${p.name} palette to reach at least ${target}:1. Consider using the Contrast-Aware palette variant.`,
        });
      }
    }
  }

  return findings;
}

// ─── Color-blind risk checks ─────────────────────────────────────────────────

/**
 * Flag palettes that rely on red/green or yellow/blue distinctions.
 */
function checkColorBlindRisk(palette: PaletteSet): AccessibilityFinding[] {
  const findings: AccessibilityFinding[] = [];

  for (const p of Object.values(palette) as Array<{ name: string; colors: ColorSample[] }>) {
    const colors = p.colors;
    // Deuteranopia / Protanopia risk: red + green pairs
    const reds = colors.filter((c: ColorSample) => {
      const [h] = rgbToHsl(c.rgb[0], c.rgb[1], c.rgb[2]);
      return (h >= 0 && h <= 30) || h >= 345;
    });
    const greens = colors.filter((c: ColorSample) => {
      const [h] = rgbToHsl(c.rgb[0], c.rgb[1], c.rgb[2]);
      return h >= 90 && h <= 150;
    });

    if (reds.length > 0 && greens.length > 0) {
      findings.push({
        severity: "warning",
        message: `Palette "${p.name}" contains both red and green tones which may be indistinguishable for users with deuteranopia or protanopia (red-green color blindness).`,
        affectedReferenceIds: [...reds, ...greens].flatMap(
          (c) => c.sourceReferenceIds
        ),
        recommendation:
          "Add a shape, pattern, or label to any element that relies solely on the red/green distinction.",
      });
    }

    // Tritanopia risk: yellow + blue pairs
    const yellows = colors.filter((c: ColorSample) => {
      const [h] = rgbToHsl(c.rgb[0], c.rgb[1], c.rgb[2]);
      return h >= 45 && h <= 70;
    });
    const blues = colors.filter((c: ColorSample) => {
      const [h] = rgbToHsl(c.rgb[0], c.rgb[1], c.rgb[2]);
      return h >= 220 && h <= 260;
    });

    if (yellows.length > 0 && blues.length > 0) {
      findings.push({
        severity: "info",
        message: `Palette "${p.name}" uses yellow and blue tones which may be harder to distinguish for users with tritanopia (blue-yellow color blindness).`,
        affectedReferenceIds: [...yellows, ...blues].flatMap(
          (c) => c.sourceReferenceIds
        ),
        recommendation:
          "Ensure yellow and blue elements are differentiated by brightness or shape, not color alone.",
      });
    }
  }

  return findings;
}

// ─── Resolution checks ───────────────────────────────────────────────────────

function checkResolution(
  refs: RankedReference[],
  constraints: CreativeConstraint[]
): AccessibilityFinding[] {
  const findings: AccessibilityFinding[] = [];
  const outputType = constraints.find((c) => c.type === "output")?.value as
    | string
    | undefined;
  const minRes = constraints.find((c) => c.type === "minResolution")?.value as
    | number
    | undefined;

  for (const ref of refs) {
    const { widthPx, heightPx } = ref.features;
    if (widthPx === 0 || heightPx === 0) continue; // No dimension data

    // For print output, estimate DPI assuming A4 (210×297 mm)
    if (outputType === "print") {
      const mmToInch = 25.4;
      const a4WidthInch = 210 / mmToInch;
      const estimatedDpi = widthPx / a4WidthInch;

      if (estimatedDpi < 150) {
        findings.push({
          severity: estimatedDpi < 72 ? "error" : "warning",
          message: `${ref.file.filename}: estimated resolution of ~${Math.round(estimatedDpi)} DPI may not be sufficient for print output (recommended ≥300 DPI for A4).`,
          affectedReferenceIds: [ref.file.id],
          recommendation:
            "Use this reference for compositional or color inspiration only, not as a print-ready asset.",
        });
      }
    }

    // Custom minimum resolution check
    if (minRes) {
      const pixels = widthPx * heightPx;
      const minPixels = minRes * minRes;
      if (pixels < minPixels) {
        findings.push({
          severity: "warning",
          message: `${ref.file.filename}: dimensions ${widthPx}×${heightPx}px are below the minimum resolution of ${minRes}×${minRes}px.`,
          affectedReferenceIds: [ref.file.id],
          recommendation:
            "Use a higher-resolution version of this reference if available.",
        });
      }
    }
  }

  return findings;
}

// ─── Aspect ratio checks ─────────────────────────────────────────────────────

const FORMAT_ASPECT_RATIOS: Record<string, [number, number]> = {
  poster: [0.6, 0.8],      // A-series portrait
  social: [0.8, 1.25],     // square-ish
  website: [1.3, 2.0],     // landscape
  logo: [0.7, 1.5],        // flexible
};

function checkAspectRatio(
  refs: RankedReference[],
  constraints: CreativeConstraint[]
): AccessibilityFinding[] {
  const findings: AccessibilityFinding[] = [];
  const format = constraints.find((c) => c.type === "format")?.value as
    | string
    | undefined;
  if (!format) return findings;

  const range = FORMAT_ASPECT_RATIOS[format];
  if (!range) return findings;

  const [minRatio, maxRatio] = range;
  const mismatch = refs.filter(
    (r) =>
      r.features.aspectRatio < minRatio || r.features.aspectRatio > maxRatio
  );

  if (mismatch.length > refs.length * 0.5) {
    findings.push({
      severity: "info",
      message: `${mismatch.length} of ${refs.length} selected references have aspect ratios outside the typical range for "${format}" (${minRatio}–${maxRatio}).`,
      affectedReferenceIds: mismatch.map((r) => r.file.id),
      recommendation: `Consider selecting references with aspect ratios between ${minRatio} and ${maxRatio} for better format fit.`,
    });
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function checkAccessibility(
  refs: RankedReference[],
  palette: PaletteSet,
  constraints: CreativeConstraint[]
): AccessibilityFinding[] {
  return [
    ...checkPaletteContrast(palette, constraints),
    ...checkColorBlindRisk(palette),
    ...checkResolution(refs, constraints),
    ...checkAspectRatio(refs, constraints),
  ];
}
