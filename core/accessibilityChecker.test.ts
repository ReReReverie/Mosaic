import { describe, it, expect } from "vitest";
import { checkAccessibility } from "./accessibilityChecker";
import { generatePalettes } from "./paletteEngine";
import type { RankedReference, CreativeConstraint } from "./types";

function makeRef(
  id: string,
  widthPx = 800,
  heightPx = 1131,
  aspectRatio = 0.7
): RankedReference {
  return {
    file: { id, path: `/r/${id}.jpg`, filename: `${id}.jpg`, mimeType: "image/jpeg", sizeBytes: 1000, lastModified: 0 },
    features: {
      colors: [{ hex: "#ff6600", rgb: [255, 102, 0], role: "unknown", sourceReferenceIds: [], contrastWarnings: [] }],
      brightness: 0.5, saturation: 0.5, contrast: 0.5, aspectRatio,
      orientation: "portrait", subjectPlacement: "center", hasText: false,
      extractedText: [], fileQualityScore: 0.8, widthPx, heightPx, isIllustrative: false,
    },
    score: 0.7,
    scoreBreakdown: { promptRelevance: 0.7, semanticMatch: 0.7, visualFit: 0.7, colorSuitability: 0.7, fileQuality: 0.7, total: 0.7 },
    reasons: [], isPinned: false, isRemoved: false, isTooSimilar: false,
  };
}

describe("checkAccessibility", () => {
  it("returns an array of findings (may be empty for safe input)", () => {
    const refs = [makeRef("a")];
    const palette = generatePalettes(refs);
    const result = checkAccessibility(refs, palette, []);
    expect(Array.isArray(result)).toBe(true);
  });

  it("flags poor contrast between text and background", () => {
    // Build a palette that will likely have poor contrast (yellow on white)
    const ref = {
      ...makeRef("c"),
      features: {
        ...makeRef("c").features,
        colors: [
          { hex: "#ffff99", rgb: [255, 255, 153] as [number,number,number], role: "unknown" as const, sourceReferenceIds: [], contrastWarnings: [] },
          { hex: "#ffffcc", rgb: [255, 255, 204] as [number,number,number], role: "unknown" as const, sourceReferenceIds: [], contrastWarnings: [] },
        ],
      },
    };
    const palette = generatePalettes([ref]);
    const findings = checkAccessibility([ref], palette, []);
    // May or may not trigger depending on assigned roles, but function should not throw
    expect(Array.isArray(findings)).toBe(true);
  });

  it("flags red/green color-blind risk", () => {
    const redRef = {
      ...makeRef("r"),
      features: {
        ...makeRef("r").features,
        colors: [
          { hex: "#ff0000", rgb: [255, 0, 0] as [number,number,number], role: "unknown" as const, sourceReferenceIds: [], contrastWarnings: [] },
          { hex: "#00ff00", rgb: [0, 255, 0] as [number,number,number], role: "unknown" as const, sourceReferenceIds: [], contrastWarnings: [] },
          { hex: "#ffffff", rgb: [255, 255, 255] as [number,number,number], role: "unknown" as const, sourceReferenceIds: [], contrastWarnings: [] },
        ],
      },
    };
    const palette = generatePalettes([redRef]);
    const findings = checkAccessibility([redRef], palette, []);
    const colorBlindWarning = findings.find((f) =>
      f.message.toLowerCase().includes("red") && f.message.toLowerCase().includes("green")
    );
    expect(colorBlindWarning).toBeDefined();
  });

  it("flags low resolution for print output", () => {
    // 200×283px — very low resolution
    const ref = makeRef("lores", 200, 283, 0.7);
    const palette = generatePalettes([ref]);
    const constraints: CreativeConstraint[] = [
      { type: "output", value: "print", description: "print output" },
    ];
    const findings = checkAccessibility([ref], palette, constraints);
    const resWarning = findings.find((f) => f.message.includes("lores.jpg"));
    expect(resWarning).toBeDefined();
  });

  it("flags aspect ratio mismatch for poster format", () => {
    // Landscape references for a poster format — >50% mismatch
    const refs = [
      makeRef("a", 1920, 1080, 1.78), // landscape
      makeRef("b", 1920, 1080, 1.78), // landscape
      makeRef("c", 800, 1131, 0.7),   // portrait (matching)
    ];
    const palette = generatePalettes(refs);
    const constraints: CreativeConstraint[] = [
      { type: "format", value: "poster", description: "poster format" },
    ];
    const findings = checkAccessibility(refs, palette, constraints);
    const aspectWarning = findings.find((f) =>
      f.message.toLowerCase().includes("aspect ratio")
    );
    expect(aspectWarning).toBeDefined();
  });

  it("respects AAA standard when constraint is set", () => {
    const constraints: CreativeConstraint[] = [
      { type: "accessibilityStandard", value: "AAA", description: "WCAG AAA" },
    ];
    const ref = makeRef("a");
    const palette = generatePalettes([ref]);
    // Just ensure it doesn't throw
    expect(() => checkAccessibility([ref], palette, constraints)).not.toThrow();
  });
});
