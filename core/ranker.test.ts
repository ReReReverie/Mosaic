import { describe, it, expect } from "vitest";
import { rankReferences, validateWeights } from "./ranker";
import { interpretDeterministic } from "./promptInterpreter";
import type {
  ReferenceFile,
  ReferenceFeatures,
  CreativeDirection,
  CreativeConstraint,
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
    edgeDensity: 0.3,
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

  it("puts reference-specific AI evidence ahead of repeated heuristics", () => {
    const file = makeFile("a", "red-curtain.jpg");
    const feat = makeFeatures({
      semanticDescription: "Two figures meet against a saturated red curtain",
      semanticRationale: "The face-to-face gesture and saturated red field support a dramatic editorial direction.",
      semanticEvidence: ["face-to-face gesture", "saturated red field"],
      semanticTags: ["theatrical", "intimate", "red curtain"],
    });
    const result = rankReferences([file], new Map([["a", feat]]), DIRECTION, WEIGHTS);
    expect(result[0].reasons[0]).toMatch(/^AI why:/);
    expect(result[0].reasons[0]).toContain("dramatic editorial direction");
    expect(result[0].reasons[1]).toMatch(/^AI evidence:/);
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

  it("does not apply a web-format reason when the brief has no format", () => {
    const direction: CreativeDirection = {
      ...DIRECTION,
      formats: [],
    };
    const file = makeFile("a", "inspiring.jpg");
    const result = rankReferences([file], new Map([["a", makeFeatures({ orientation: "landscape" })]]), direction, WEIGHTS);
    expect(result[0].reasons.join(" ")).not.toMatch(/web format/i);
  });

  it("uses explicit UI constraints in visual fit", () => {
    const constraints: CreativeConstraint[] = [{ type: "format", value: "poster", description: "Format: poster" }];
    const direction = { ...DIRECTION, formats: [] };
    const file = makeFile("a", "portrait.jpg");
    const result = rankReferences([file], new Map([["a", makeFeatures({ orientation: "portrait" })]]), direction, WEIGHTS, new Set(), new Set(), constraints);
    expect(result[0].reasons.join(" ")).toMatch(/poster format/i);
  });

  it("ranks a visually dramatic reference above a flat one for awe-inspiring intent", () => {
    const direction = interpretDeterministic("Give me something awe inspiring.");
    const dramatic = makeFeatures({ brightness: 0.3, saturation: 0.65, contrast: 0.8, edgeDensity: 0.7 });
    const flat = makeFeatures({ brightness: 0.55, saturation: 0.12, contrast: 0.15, edgeDensity: 0.08 });
    const result = rankReferences(
      [makeFile("dramatic", "mountain.jpg"), makeFile("flat", "plain.jpg")],
      new Map([["dramatic", dramatic], ["flat", flat]]),
      direction,
      WEIGHTS
    );
    expect(result[0].file.id).toBe("dramatic");
  });

  it("uses an independent mysterious mood signature", () => {
    const direction = interpretDeterministic("Make it mysterious.");
    const shadow = makeFeatures({ brightness: 0.25, saturation: 0.25, contrast: 0.7, edgeDensity: 0.45 });
    const bright = makeFeatures({ brightness: 0.8, saturation: 0.25, contrast: 0.2, edgeDensity: 0.08 });
    const result = rankReferences(
      [makeFile("shadow", "shadow.jpg"), makeFile("bright", "bright.jpg")],
      new Map([["shadow", shadow], ["bright", bright]]),
      direction,
      WEIGHTS
    );
    expect(result[0].file.id).toBe("shadow");
  });

  it("diversifies near-tied vague-brief results", () => {
    const direction: CreativeDirection = {
      subject: [], audience: [], mood: [], style: [], colors: [], formats: [], constraints: [], ambiguities: [],
    };
    const similarA = makeFeatures({ brightness: 0.25, saturation: 0.25, contrast: 0.3, orientation: "portrait", isIllustrative: false });
    const similarB = makeFeatures({ brightness: 0.27, saturation: 0.26, contrast: 0.31, orientation: "portrait", isIllustrative: false });
    const contrasting = makeFeatures({ brightness: 0.8, saturation: 0.7, contrast: 0.7, orientation: "landscape", isIllustrative: true });
    const result = rankReferences(
      [makeFile("a"), makeFile("b"), makeFile("c")],
      new Map([["a", similarA], ["b", similarB], ["c", contrasting]]),
      direction,
      WEIGHTS
    );
    expect(result[1].file.id).toBe("c");
  });
});
