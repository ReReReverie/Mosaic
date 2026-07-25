import { describe, it, expect } from "vitest";
import { analyzeStyleDNA } from "./styleDNA";
import type { RankedReference } from "./types";

function makeRef(overrides: {
  brightness?: number;
  saturation?: number;
  contrast?: number;
  orientation?: "portrait" | "landscape" | "square";
  subjectPlacement?: "center" | "top" | "bottom" | "left" | "right" | "distributed";
  isIllustrative?: boolean;
  colors?: [number, number, number][];
  id?: string;
}): RankedReference {
  const colors = (overrides.colors ?? [[255, 102, 0]]).map(([r, g, b]) => ({
    hex: `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`,
    rgb: [r, g, b] as [number, number, number],
    role: "unknown" as const,
    sourceReferenceIds: [],
    contrastWarnings: [],
  }));

  return {
    file: {
      id: overrides.id ?? "ref-1",
      path: "/ref.jpg",
      filename: "ref.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 500000,
      lastModified: 0,
    },
    features: {
      colors,
      brightness: overrides.brightness ?? 0.5,
      saturation: overrides.saturation ?? 0.4,
      contrast: overrides.contrast ?? 0.5,
      aspectRatio: 0.7,
      orientation: overrides.orientation ?? "portrait",
      subjectPlacement: overrides.subjectPlacement ?? "center",
      hasText: false,
      extractedText: [],
      fileQualityScore: 0.8,
      widthPx: 800,
      heightPx: 1131,
      isIllustrative: overrides.isIllustrative ?? false,
    },
    score: 0.7,
    scoreBreakdown: {
      promptRelevance: 0.7,
      semanticMatch: 0.7,
      visualFit: 0.7,
      colorSuitability: 0.7,
      fileQuality: 0.7,
      total: 0.7,
    },
    reasons: [],
    isPinned: false,
    isRemoved: false,
    isTooSimilar: false,
  };
}

describe("analyzeStyleDNA", () => {
  it("returns a non-empty summary for a non-empty set", () => {
    const refs = [
      makeRef({ brightness: 0.7, orientation: "portrait", id: "a" }),
      makeRef({ brightness: 0.8, orientation: "portrait", id: "b" }),
    ];
    const dna = analyzeStyleDNA(refs);
    expect(dna.summary.length).toBeGreaterThan(10);
  });

  it("handles empty input gracefully", () => {
    const dna = analyzeStyleDNA([]);
    expect(dna.summary).toContain("No references");
    expect(dna.colors).toHaveLength(0);
  });

  it("detects dominant portrait orientation", () => {
    const refs = Array.from({ length: 7 }, (_, i) =>
      makeRef({ orientation: "portrait", id: `r${i}` })
    );
    refs.push(makeRef({ orientation: "landscape", id: "r8" }));
    refs.push(makeRef({ orientation: "landscape", id: "r9" }));
    const dna = analyzeStyleDNA(refs);
    expect(dna.dominantOrientation).toBe("portrait");
  });

  it("flags dark backgrounds as overrepresented when >60% are dark", () => {
    const refs = Array.from({ length: 7 }, (_, i) =>
      makeRef({ brightness: 0.2, id: `d${i}` })
    );
    refs.push(makeRef({ brightness: 0.8, id: "l1" }));
    refs.push(makeRef({ brightness: 0.8, id: "l2" }));
    const dna = analyzeStyleDNA(refs);
    expect(dna.overrepresentedPatterns).toContain("dark backgrounds");
  });

  it("calculates mean brightness across references", () => {
    const refs = [
      makeRef({ brightness: 0.2, id: "a" }),
      makeRef({ brightness: 0.8, id: "b" }),
    ];
    const dna = analyzeStyleDNA(refs);
    expect(dna.brightness).toBeCloseTo(0.5, 2);
  });

  it("aggregates colors from all selected references", () => {
    const refs = [
      makeRef({ colors: [[255, 0, 0]], id: "a" }),
      makeRef({ colors: [[255, 0, 0]], id: "b" }),
      makeRef({ colors: [[0, 0, 255]], id: "c" }),
    ];
    const dna = analyzeStyleDNA(refs);
    expect(dna.colors.some((c) => c.hex === "#ff0000")).toBe(true);
  });
});
