import { describe, expect, it } from "vitest";
import { normalizeAnalysisResult } from "./analysisCompatibility";
import type { AnalysisResult } from "./types";

describe("normalizeAnalysisResult", () => {
  it("adds default-first fields to an older persisted result", () => {
    const legacy = {
      sessionId: "legacy-session",
      brief: "A warm portrait",
      creativeDirection: {
        subject: ["people"],
        audience: [],
        mood: ["warm"],
        style: [],
        colors: ["warm"],
        formats: [],
        constraints: [],
        ambiguities: [],
      },
      references: [{
        file: {
          id: "legacy-reference",
          path: "/refs/legacy.jpg",
          filename: "legacy.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 10,
          lastModified: 0,
        },
        features: {
          colors: [],
          brightness: 0.5,
          saturation: 0.3,
          contrast: 0.4,
          aspectRatio: 1,
          orientation: "square",
          subjectPlacement: "center",
          hasText: false,
          extractedText: ["portrait"],
          fileQualityScore: 0.5,
          widthPx: 100,
          heightPx: 100,
          isIllustrative: false,
          edgeDensity: 0.2,
        },
        score: 0.5,
        scoreBreakdown: {
          promptRelevance: 0.5,
          semanticMatch: 0.5,
          visualFit: 0.5,
          colorSuitability: 0.5,
          fileQuality: 0.5,
          total: 0.5,
        },
        reasons: [],
        isPinned: false,
        isRemoved: false,
        isTooSimilar: false,
      }],
      styleDNA: {
        summary: "",
        colors: [],
        composition: [],
        lighting: [],
        texture: [],
        layout: [],
        overrepresentedPatterns: [],
        brightness: 0.5,
        saturation: 0.3,
        contrast: 0.4,
        dominantOrientation: "square",
      },
      diversitySuggestions: [],
      palette: {
        extracted: { name: "Extracted", colors: [] },
        harmonized: { name: "Harmonized", colors: [] },
        contrastAware: { name: "Contrast-aware", colors: [] },
      },
      accessibilityFindings: [],
      skippedFiles: [],
      scoringWeights: {
        promptRelevance: 0.4,
        semanticMatch: 0.25,
        visualFit: 0.2,
        colorSuitability: 0.1,
        fileQuality: 0.05,
      },
      analyzedAt: 0,
    } as unknown as AnalysisResult;

    const normalized = normalizeAnalysisResult(legacy);
    expect(normalized.promptAnalysis.dimensions.length).toBeGreaterThanOrEqual(7);
    expect(normalized.references[0]?.referenceEvaluation?.overallMatchScore).toBeDefined();
    expect(normalized.referenceSynthesis.summary).toContain("Combine");
  });
});
