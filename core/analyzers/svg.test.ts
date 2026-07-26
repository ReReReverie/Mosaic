import { describe, it, expect } from "vitest";
import { svgAnalyzer } from "./svg";
import type { ReferenceFile } from "../types";

function makeFile(overrides?: Partial<ReferenceFile>): ReferenceFile {
  return {
    id: "test-svg",
    path: "/refs/logo.svg",
    filename: "logo.svg",
    mimeType: "image/svg+xml",
    sizeBytes: 1024,
    lastModified: 0,
    ...overrides,
  };
}

const SVG_SAMPLE = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 200" width="100" height="200">
  <rect fill="#ff0000" stroke="#0000ff" width="100" height="100"/>
  <circle fill="rgb(0, 255, 0)" cx="50" cy="150" r="30"/>
  <text x="10" y="190">Hello World</text>
</svg>
`;

const EMPTY_SVG = `<svg xmlns="http://www.w3.org/2000/svg"></svg>`;

describe("svgAnalyzer", () => {
  it("canAnalyze returns true for SVG", () => {
    expect(svgAnalyzer.canAnalyze(makeFile())).toBe(true);
  });

  it("canAnalyze returns false for JPEG", () => {
    expect(svgAnalyzer.canAnalyze(makeFile({ mimeType: "image/jpeg" }))).toBe(false);
  });

  it("extracts fill and stroke colors", async () => {
    const result = await svgAnalyzer.analyze(
      makeFile(),
      Buffer.from(SVG_SAMPLE)
    );
    const hexes = (result.colors ?? []).map((c) => c.hex);
    expect(hexes).toContain("#ff0000");
    expect(hexes).toContain("#0000ff");
    expect(hexes).toContain("#00ff00");
  });

  it("extracts viewBox dimensions and sets portrait orientation", async () => {
    const result = await svgAnalyzer.analyze(
      makeFile(),
      Buffer.from(SVG_SAMPLE)
    );
    expect(result.orientation).toBe("portrait");
    expect(result.aspectRatio).toBeCloseTo(0.5, 2);
  });

  it("marks isIllustrative true", async () => {
    const result = await svgAnalyzer.analyze(makeFile(), Buffer.from(SVG_SAMPLE));
    expect(result.isIllustrative).toBe(true);
  });

  it("extracts text content", async () => {
    const result = await svgAnalyzer.analyze(makeFile(), Buffer.from(SVG_SAMPLE));
    expect(result.hasText).toBe(true);
    expect(result.extractedText).toContain("hello");
  });

  it("handles an empty SVG gracefully", async () => {
    const result = await svgAnalyzer.analyze(makeFile(), Buffer.from(EMPTY_SVG));
    expect(result.colors).toHaveLength(0);
    expect(result.hasText).toBe(false);
  });
});
