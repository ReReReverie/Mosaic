import { describe, it, expect } from "vitest";
import { analyzeDiversity } from "./diversityAnalyzer";
import type { RankedReference, ReferenceFeatures } from "./types";

function makeRef(
  id: string,
  overrides: Partial<ReferenceFeatures> = {}
): RankedReference {
  return {
    file: {
      id,
      path: `/refs/${id}.jpg`,
      filename: `${id}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 500000,
      lastModified: 0,
    },
    features: {
      colors: [
        { hex: "#ff6600", rgb: [255, 102, 0], role: "unknown", sourceReferenceIds: [], contrastWarnings: [] },
      ],
      brightness: 0.2,
      saturation: 0.5,
      contrast: 0.7,
      aspectRatio: 0.7,
      orientation: "portrait",
      subjectPlacement: "center",
      hasText: false,
      extractedText: [],
      fileQualityScore: 0.8,
      widthPx: 800,
      heightPx: 1131,
      isIllustrative: false,
      edgeDensity: 0.3,
      ...overrides,
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

describe("analyzeDiversity", () => {
  it("returns no suggestions for fewer than 3 selected references", () => {
    const result = analyzeDiversity(
      [makeRef("a"), makeRef("b")],
      [makeRef("c")]
    );
    expect(result).toHaveLength(0);
  });

  it("returns no suggestions when there are no alternatives in the pool", () => {
    const selected = Array.from({ length: 8 }, (_, i) =>
      makeRef(`s${i}`, { brightness: 0.2 }) // all dark
    );
    // Pool is empty of light alternatives
    const result = analyzeDiversity(selected, selected);
    expect(result.every((s) => s.referenceIds.length > 0)).toBe(true);
  });

  it("detects dark background overrepresentation and suggests light alternatives", () => {
    const selected = Array.from({ length: 8 }, (_, i) =>
      makeRef(`dark${i}`, { brightness: 0.2 })
    );
    const pool = [
      ...selected,
      makeRef("light1", { brightness: 0.85 }),
      makeRef("light2", { brightness: 0.90 }),
      makeRef("light3", { brightness: 0.80 }),
    ];
    const suggestions = analyzeDiversity(selected, pool);
    const lightDark = suggestions.find((s) => s.dimension === "light-dark");
    expect(lightDark).toBeDefined();
    expect(lightDark!.referenceIds).toContain("light1");
  });

  it("detects portrait overrepresentation and suggests landscape alternatives", () => {
    const selected = Array.from({ length: 7 }, (_, i) =>
      makeRef(`p${i}`, { orientation: "portrait" })
    );
    const pool = [
      ...selected,
      makeRef("ls1", { orientation: "landscape" }),
      makeRef("ls2", { orientation: "landscape" }),
    ];
    const suggestions = analyzeDiversity(selected, pool);
    const portLand = suggestions.find((s) => s.dimension === "portrait-landscape");
    expect(portLand).toBeDefined();
  });

  it("does not introduce external references — all suggestions from pool", () => {
    const selected = Array.from({ length: 7 }, (_, i) =>
      makeRef(`s${i}`, { brightness: 0.2 })
    );
    const poolExtra = [makeRef("extra1", { brightness: 0.9 })];
    const pool = [...selected, ...poolExtra];
    const suggestions = analyzeDiversity(selected, pool);
    for (const s of suggestions) {
      for (const id of s.referenceIds) {
        expect(pool.some((r) => r.file.id === id)).toBe(true);
      }
    }
  });

  it("suggestions include a human-readable reason string", () => {
    const selected = Array.from({ length: 7 }, (_, i) =>
      makeRef(`dark${i}`, { brightness: 0.15 })
    );
    const pool = [
      ...selected,
      makeRef("light1", { brightness: 0.9 }),
    ];
    const suggestions = analyzeDiversity(selected, pool);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].reason.length).toBeGreaterThan(10);
  });
});
