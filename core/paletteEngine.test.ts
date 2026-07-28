import { describe, it, expect } from "vitest";
import {
  relativeLuminance,
  contrastRatio,
  generatePalettes,
} from "./paletteEngine";
import type { RankedReference } from "./types";

function makeRef(id: string, hexColors: string[]): RankedReference {
  const colors = hexColors.map((hex) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { hex, rgb: [r, g, b] as [number, number, number], role: "unknown" as const, sourceReferenceIds: [], contrastWarnings: [] };
  });

  return {
    file: { id, path: `/r/${id}.jpg`, filename: `${id}.jpg`, mimeType: "image/jpeg", sizeBytes: 1000, lastModified: 0 },
    features: {
      colors,
      brightness: 0.5, saturation: 0.5, contrast: 0.5, aspectRatio: 1,
      orientation: "square", subjectPlacement: "center", hasText: false,
      extractedText: [], fileQualityScore: 0.8, widthPx: 800, heightPx: 800, isIllustrative: false,
      edgeDensity: 0.3,
    },
    score: 0.7,
    scoreBreakdown: { promptRelevance: 0.7, semanticMatch: 0.7, visualFit: 0.7, colorSuitability: 0.7, fileQuality: 0.7, total: 0.7 },
    reasons: [], isPinned: false, isRemoved: false, isTooSimilar: false,
  };
}

describe("relativeLuminance", () => {
  it("white has luminance 1", () =>
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 3));
  it("black has luminance 0", () =>
    expect(relativeLuminance(0, 0, 0)).toBeCloseTo(0, 3));
});

describe("contrastRatio", () => {
  it("black on white = 21:1", () =>
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 0));
  it("identical colors = 1:1", () =>
    expect(contrastRatio([128, 128, 128], [128, 128, 128])).toBeCloseTo(1, 2));
  it("is symmetric", () => {
    const ab = contrastRatio([255, 0, 0], [0, 0, 255]);
    const ba = contrastRatio([0, 0, 255], [255, 0, 0]);
    expect(ab).toBeCloseTo(ba, 5);
  });
});

describe("generatePalettes", () => {
  const refs = [
    makeRef("a", ["#ff6600", "#ffcc00", "#ffffff"]),
    makeRef("b", ["#ff6600", "#cc3300", "#333333"]),
  ];

  it("returns three palette variants", () => {
    const ps = generatePalettes(refs);
    expect(ps.extracted).toBeDefined();
    expect(ps.harmonized).toBeDefined();
    expect(ps.contrastAware).toBeDefined();
  });

  it("extracted palette contains colors from the references", () => {
    const ps = generatePalettes(refs);
    const hexes = ps.extracted.colors.map((c) => c.hex);
    expect(hexes).toContain("#ff6600");
  });

  it("each palette has up to 5 colors", () => {
    const ps = generatePalettes(refs);
    expect(ps.extracted.colors.length).toBeLessThanOrEqual(5);
    expect(ps.harmonized.colors.length).toBeLessThanOrEqual(5);
    expect(ps.contrastAware.colors.length).toBeLessThanOrEqual(5);
  });

  it("contrast-aware palette text/background pairs pass AA (4.5:1)", () => {
    const ps = generatePalettes(refs);
    // Find background and text colors
    const bg = ps.contrastAware.colors.find((c) => c.role === "background");
    const text = ps.contrastAware.colors.find((c) => c.role === "text");
    if (bg && text) {
      const ratio = contrastRatio(bg.rgb, text.rgb);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("handles empty references gracefully", () => {
    const ps = generatePalettes([]);
    expect(ps.extracted.colors).toHaveLength(0);
    expect(ps.harmonized.colors).toHaveLength(0);
    expect(ps.contrastAware.colors).toHaveLength(0);
  });

  it("colors have hex, rgb, and role fields", () => {
    const ps = generatePalettes(refs);
    for (const c of ps.extracted.colors) {
      expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(c.rgb).toHaveLength(3);
      expect(c.role).toBeDefined();
    }
  });
});
