import type {
  RankedReference,
  ColorSample,
  ContrastWarning,
  Palette,
  PaletteSet,
} from "./types";
import { rgbToHsl, rgbToHex } from "./analyzers/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Palette Engine
// Derives three palette options from the selected references.
// ─────────────────────────────────────────────────────────────────────────────

// ─── WCAG contrast calculation ──────────────────────────────────────────────

function linearize(c: number): number {
  const n = c / 255;
  return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

export function contrastRatio(
  [r1, g1, b1]: [number, number, number],
  [r2, g2, b2]: [number, number, number]
): number {
  const L1 = relativeLuminance(r1, g1, b1);
  const L2 = relativeLuminance(r2, g2, b2);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

function buildContrastWarning(
  colorA: ColorSample,
  colorB: ColorSample
): ContrastWarning | null {
  const ratio = contrastRatio(colorA.rgb, colorB.rgb);
  if (ratio < 7) {
    return {
      pairedWith: colorB.hex,
      ratio: Math.round(ratio * 100) / 100,
      failsAA: ratio < 4.5,
      failsAAA: ratio < 7,
    };
  }
  return null;
}

// ─── Role assignment ─────────────────────────────────────────────────────────

type Role = ColorSample["role"];

/**
 * Assign semantic roles to a palette based on lightness and saturation.
 * background: lightest, text: darkest, accent: highest chroma,
 * surface: second lightest, primary: mid-tone.
 */
function assignRoles(colors: ColorSample[]): ColorSample[] {
  if (colors.length === 0) return colors;

  const withHsl = colors.map((c) => ({
    c,
    hsl: rgbToHsl(c.rgb[0], c.rgb[1], c.rgb[2]),
  }));

  // Sort by lightness
  withHsl.sort((a, b) => b.hsl[2] - a.hsl[2]);

  const roles: Role[] = ["background", "surface", "primary", "accent", "text"];
  // Highest saturation gets "accent"
  const maxSatIdx = withHsl.reduce(
    (best, { hsl }, i) => (hsl[1] > withHsl[best].hsl[1] ? i : best),
    0
  );

  const result: ColorSample[] = withHsl.map(({ c }, i) => ({
    ...c,
    role: roles[Math.min(i, roles.length - 1)] as Role,
  }));

  // Override accent assignment
  if (result[maxSatIdx]) {
    const current = result[maxSatIdx].role;
    if (current !== "background" && current !== "text") {
      result[maxSatIdx] = { ...result[maxSatIdx], role: "accent" };
    }
  }

  return result;
}

// ─── Contrast warnings ────────────────────────────────────────────────────────

function attachContrastWarnings(colors: ColorSample[]): ColorSample[] {
  return colors.map((c, i) => {
    const warnings: ContrastWarning[] = [];
    for (let j = 0; j < colors.length; j++) {
      if (i === j) continue;
      const w = buildContrastWarning(c, colors[j]);
      if (w) warnings.push(w);
    }
    return { ...c, contrastWarnings: warnings };
  });
}

// ─── Color extraction from references ────────────────────────────────────────

function extractBaseColors(refs: RankedReference[]): [number, number, number][] {
  const freq = new Map<string, { rgb: [number, number, number]; count: number }>();

  for (const ref of refs) {
    for (const c of ref.features.colors) {
      const entry = freq.get(c.hex);
      if (entry) {
        entry.count++;
      } else {
        freq.set(c.hex, { rgb: c.rgb, count: 1 });
      }
    }
  }

  return [...freq.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map(({ rgb }) => rgb);
}

// ─── HSL-based analogous shift ────────────────────────────────────────────────

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;

  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function shiftHue(
  rgb: [number, number, number],
  degrees: number
): [number, number, number] {
  const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  const newH = (h + degrees + 360) % 360;
  return hslToRgb(newH, s, l);
}

function buildHarmonizedColors(
  base: [number, number, number][]
): [number, number, number][] {
  if (base.length === 0) return [];
  const shifts = [-30, -15, 0, 15, 30];
  return shifts.slice(0, base.length).map((shift, i) =>
    shiftHue(base[i % base.length], shift)
  );
}

// ─── Contrast-aware palette ───────────────────────────────────────────────────

/**
 * Adjust lightness of a color until text/bg pair reaches WCAG AA (4.5:1).
 */
function adjustForContrast(
  textRgb: [number, number, number],
  bgRgb: [number, number, number],
  targetRatio = 4.5
): [number, number, number] {
  const [h, s, initialLightness] = rgbToHsl(textRgb[0], textRgb[1], textRgb[2]);
  let l = initialLightness;

  // Try darkening first
  for (let i = 0; i < 20; i++) {
    const candidate = hslToRgb(h, s, l);
    if (contrastRatio(candidate, bgRgb) >= targetRatio) return candidate;
    l = Math.max(0, l - 0.05);
  }

  // Fall back to near-black
  return [20, 20, 20];
}

function buildContrastAwareColors(
  base: [number, number, number][]
): [number, number, number][] {
  if (base.length === 0) return [];

  // Use the lightest color as background, adjust rest for contrast
  const sorted = [...base].sort((a, b) => {
    const [, , la] = rgbToHsl(a[0], a[1], a[2]);
    const [, , lb] = rgbToHsl(b[0], b[1], b[2]);
    return lb - la;
  });

  const bg = sorted[0];
  const adjusted = sorted.map((c, i) => {
    if (i === 0) return c; // background stays
    return adjustForContrast(c, bg);
  });

  return adjusted.slice(0, 5);
}

// ─── Source reference assignment ─────────────────────────────────────────────

function attachSourceIds(
  colors: ColorSample[],
  refs: RankedReference[]
): ColorSample[] {
  return colors.map((c) => {
    const sources = refs
      .filter((r) => r.features.colors.some((rc) => rc.hex === c.hex))
      .map((r) => r.file.id);
    return { ...c, sourceReferenceIds: sources };
  });
}

// ─── Palette builder ──────────────────────────────────────────────────────────

function buildPalette(
  name: string,
  rgbs: [number, number, number][],
  refs: RankedReference[]
): Palette {
  const samples: ColorSample[] = rgbs.map((rgb) => ({
    hex: rgbToHex(...rgb),
    rgb,
    role: "unknown" as const,
    sourceReferenceIds: [],
    contrastWarnings: [],
  }));

  const withRoles = assignRoles(samples);
  const withSources = attachSourceIds(withRoles, refs);
  const withWarnings = attachContrastWarnings(withSources);

  return { name, colors: withWarnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function generatePalettes(refs: RankedReference[]): PaletteSet {
  const baseRgbs = extractBaseColors(refs);
  const harmonizedRgbs = buildHarmonizedColors(baseRgbs);
  const contrastRgbs = buildContrastAwareColors(baseRgbs);

  return {
    extracted: buildPalette("Extracted Base", baseRgbs, refs),
    harmonized: buildPalette("Harmonized Variation", harmonizedRgbs, refs),
    contrastAware: buildPalette("Contrast-Aware Variation", contrastRgbs, refs),
  };
}
