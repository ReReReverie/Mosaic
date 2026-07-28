import { describe, expect, it } from "vitest";
import { interpretPromptAnalysisDeterministic } from "./promptAnalysis";
import { evaluateReference, synthesizeReferences } from "./referenceEvaluator";
import type { ReferenceFile, ReferenceFeatures, RankedReference } from "./types";

function file(id: string, mimeType = "image/jpeg"): ReferenceFile {
  return { id, path: `/refs/${id}`, filename: `${id}.jpg`, mimeType, sizeBytes: 100, lastModified: 0 };
}

function features(overrides: Partial<ReferenceFeatures> = {}): ReferenceFeatures {
  return {
    colors: [{ hex: "#cc6633", rgb: [204, 102, 51], role: "unknown", sourceReferenceIds: [], contrastWarnings: [] }],
    brightness: 0.55,
    saturation: 0.45,
    contrast: 0.45,
    aspectRatio: 1,
    orientation: "square",
    subjectPlacement: "center",
    hasText: false,
    extractedText: ["portrait"],
    fileQualityScore: 0.8,
    widthPx: 1200,
    heightPx: 1200,
    isIllustrative: false,
    edgeDensity: 0.3,
    ...overrides,
  };
}

function ranked(id: string, evaluation: ReturnType<typeof evaluateReference>, featureOverrides: Partial<ReferenceFeatures> = {}): RankedReference {
  return {
    file: file(id),
    features: features(featureOverrides),
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
    referenceEvaluation: evaluation,
    isPinned: false,
    isRemoved: false,
    isTooSimilar: false,
  };
}

describe("evaluateReference", () => {
  it("scores default dimensions and preserves their provenance", () => {
    const prompt = interpretPromptAnalysisDeterministic("A portrait");
    const evaluation = evaluateReference(file("portrait"), features(), prompt);
    const palette = evaluation.dimensions.find((dimension) => dimension.dimension === "palette");

    expect(evaluation.overallMatchScore).toBeGreaterThan(0);
    expect(palette).toMatchObject({ source: "default", applicable: true });
    expect(palette?.score).not.toBeNull();
  });

  it("marks unsupported visual dimensions as N/A for text references", () => {
    const prompt = interpretPromptAnalysisDeterministic("A warm portrait with fabric texture");
    const evaluation = evaluateReference(
      file("notes", "text/plain"),
      features({ colors: [], widthPx: 0, heightPx: 0, extractedText: ["portrait", "fabric"] }),
      prompt
    );
    const palette = evaluation.dimensions.find((dimension) => dimension.dimension === "palette");
    const subject = evaluation.dimensions.find((dimension) => dimension.dimension === "subject");

    expect(palette).toMatchObject({ applicable: false, score: null });
    expect(subject?.applicable).toBe(true);
  });

  it("uses measurable evidence for SVGs and limits PDFs to text and page evidence", () => {
    const prompt = interpretPromptAnalysisDeterministic("A centered illustrated portrait with fabric texture");
    const svgEvaluation = evaluateReference(
      file("illustration", "image/svg+xml"),
      features({
        semanticDescription: "A centered illustrated figure with visible fabric texture",
        semanticTags: ["portrait", "fabric"],
        isIllustrative: true,
      }),
      prompt,
    );
    const pdfEvaluation = evaluateReference(
      file("document", "application/pdf"),
      features({ extractedText: ["portrait", "layout"], widthPx: 800, heightPx: 1000 }),
      prompt,
    );

    expect(svgEvaluation.dimensions.every((dimension) => dimension.applicable)).toBe(true);
    expect(pdfEvaluation.dimensions.find((dimension) => dimension.dimension === "subject")).toMatchObject({ applicable: true });
    expect(pdfEvaluation.dimensions.find((dimension) => dimension.dimension === "composition")).toMatchObject({ applicable: true });
    expect(pdfEvaluation.dimensions.find((dimension) => dimension.dimension === "palette")).toMatchObject({ applicable: false, score: null });
  });
});

describe("synthesizeReferences", () => {
  it("reports gaps only for explicit prompt dimensions", () => {
    const prompt = interpretPromptAnalysisDeterministic("A moonlit portrait with blue colors");
    const evaluated = evaluateReference(file("plain"), features({ colors: [], extractedText: [] }), prompt);
    const result = synthesizeReferences([ranked("plain", evaluated)], prompt);

    expect(result.coverageGaps.map((gap) => gap.dimension)).toContain("lightingMood");
    expect(result.coverageGaps.map((gap) => gap.dimension)).not.toContain("poseGesture");
  });

  it("detects incompatible style directions in strong references", () => {
    const prompt = interpretPromptAnalysisDeterministic("A portrait");
    const illustrativeFeatures = features({ isIllustrative: true, extractedText: ["portrait"] });
    const photographicFeatures = features({ isIllustrative: false, extractedText: ["portrait"] });
    const first = evaluateReference(file("illustration"), illustrativeFeatures, prompt);
    const second = evaluateReference(file("photo"), photographicFeatures, prompt);
    const result = synthesizeReferences([
      ranked("illustration", first, illustrativeFeatures),
      ranked("photo", second, photographicFeatures),
    ], prompt);

    expect(result.conflicts.some((conflict) => conflict.dimensions.includes("styleRendering"))).toBe(true);
  });
});
