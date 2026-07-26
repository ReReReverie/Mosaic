import { describe, it, expect } from "vitest";
import { rankReferences, validateWeights } from "./ranker";
import type {
  ReferenceFile,
  ReferenceFeatures,
  CreativeDirection,
  ScoringWeights,
} from "./types";

const WEIGHTS: ScoringWeights = {
  promptRelevance: 0.4,
  semanticMatch: 0.25,
  visualFit: 0.2,
  colorSuitability: 0.1,
  fileQuality: 0.05,
};

function makeFile(id: string, filename = "ref.jpg"): ReferenceFile {
  return {
    id,
    path: `/refs/${filename}`,
    filename,
    mimeType: "image/jpeg",
    sizeBytes: 500000,
    lastModified: 0,
  };
}

function makeFeatures(overrides?: Partial<ReferenceFeatures>): ReferenceFeatures {
  return {
    colors: [{ hex: "#ff6600", rgb: [255, 102, 0], role: "unknown", sourceReferenceIds: [], contrastWarnings: [] }],
    brightness: 0.6,
    saturation: 0.6,
    contrast: 0.5,
    aspectRatio: 0.707,
    orientation: "portrait",
    subjectPlacement: "center",
    hasText: false,
    extractedText: [],
    fileQualityScore: 0.8,
    widthPx: 1200,
    heightPx: 1700,
    isIllustrative: false,
    ...overrides,
  };
}

const DIRECTION: CreativeDirection = {
  subject: ["food"],
  audience: ["young adults"],
  mood: ["warm"],
  style: ["editorial"],
  colors: ["warm"],
  formats: ["poster"],
  constraints: [],
  ambiguities: [],
};

describe("validateWeights", () => {
  it("passes for weights summing to 1", () => {
    expect(() => validateWeights(WEIGHTS)).not.toThrow();
  });

  it("throws for weights not summing to 1", () => {
    expect(() =>
      validateWeights({ ...WEIGHTS, promptRelevance: 0.1 })
    ).toThrow();
  });
});

describe("rankReferences", () => {
  it("returns sorted results highest score first", () => {
    const fileA = makeFile("a", "food-poster.jpg");
    const fileB = makeFile("b", "unrelated.jpg");

    const featA = makeFeatures({
      extractedText: ["food", "warm", "editorial"],
      orientation: "portrait",
      colors: [{ hex: "#ff6600", rgb: [255, 102, 0], role: "unknown", sourceReferenceIds: [], contrastWarnings: [] }],
    });
    const featB = makeFeatures({
      extractedText: [],
      orientation: "landscape",
      colors: [{ hex: "#0000ff", rgb: [0, 0, 255], role: "unknown", sourceReferenceIds: [], contrastWarnings: [] }],
    });

    const map = new Map([
      ["a", featA],
      ["b", featB],
    ]);

    const result = rankReferences([fileA, fileB], map, DIRECTION, WEIGHTS);
    expect(result[0].file.id).toBe("a");
    expect(result[0].score).toBeGreaterThan(result[1].score);
  });

  it("pinned references float to the top regardless of score", () => {
    const fileA = makeFile("a", "best-match.jpg");
    const fileB = makeFile("b", "pinned-but-low-score.jpg");

    const featA = makeFeatures({
      extractedText: ["food", "warm"],
      orientation: "portrait",
    });
    const featB = makeFeatures({
      extractedText: [],
      orientation: "landscape",
      fileQualityScore: 0.1,
    });

    const map = new Map([
      ["a", featA],
      ["b", featB],
    ]);

    const pinned = new Set(["b"]);
    const result = rankReferences([fileA, fileB], map, DIRECTION, WEIGHTS, pinned);
    expect(result[0].file.id).toBe("b");
    expect(result[0].isPinned).toBe(true);
  });

  it("excludes removed references", () => {
    const fileA = makeFile("a");
    const fileB = makeFile("b");
    const map = new Map([
      ["a", makeFeatures()],
      ["b", makeFeatures()],
    ]);
    const removed = new Set(["a"]);
    const result = rankReferences([fileA, fileB], map, DIRECTION, WEIGHTS, new Set(), removed);
    expect(result).toHaveLength(1);
    expect(result[0].file.id).toBe("b");
  });

  it("generates non-empty reasons for each reference", () => {
    const file = makeFile("a", "food-editorial.jpg");
    const feat = makeFeatures({
      extractedText: ["food", "editorial", "warm"],
      orientation: "portrait",
    });
    const map = new Map([["a", feat]]);
    const result = rankReferences([file], map, DIRECTION, WEIGHTS);
    expect(result[0].reasons.length).toBeGreaterThan(0);
    result[0].reasons.forEach((r) => expect(typeof r).toBe("string"));
  });

  it("scoreBreakdown components sum to approximately total score", () => {
    const file = makeFile("a");
    const feat = makeFeatures();
    const map = new Map([["a", feat]]);
    const result = rankReferences([file], map, DIRECTION, WEIGHTS);
    const bd = result[0].scoreBreakdown;
    const manual =
      bd.promptRelevance * WEIGHTS.promptRelevance +
      bd.semanticMatch * WEIGHTS.semanticMatch +
      bd.visualFit * WEIGHTS.visualFit +
      bd.colorSuitability * WEIGHTS.colorSuitability +
      bd.fileQuality * WEIGHTS.fileQuality;
    expect(bd.total).toBeCloseTo(manual, 5);
  });
});
