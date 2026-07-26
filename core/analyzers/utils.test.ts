import { describe, it, expect } from "vitest";
import {
  rgbToHsl,
  colorDistance,
  rgbToHex,
  kMeansColors,
  buildColorSamples,
  getOrientation,
  getAspectRatio,
} from "./utils";

describe("rgbToHsl", () => {
  it("converts red correctly", () => {
    const [h, s, l] = rgbToHsl(255, 0, 0);
    expect(h).toBeCloseTo(0, 0);
    expect(s).toBeCloseTo(1, 1);
    expect(l).toBeCloseTo(0.5, 1);
  });

  it("converts grey (achromatic)", () => {
    const [, s, l] = rgbToHsl(128, 128, 128);
    expect(s).toBeCloseTo(0, 2);
    expect(l).toBeCloseTo(128 / 255 / 2 + 128 / 255 / 2, 1);
  });

  it("converts white", () => {
    const [, , l] = rgbToHsl(255, 255, 255);
    expect(l).toBeCloseTo(1, 2);
  });
});

describe("colorDistance", () => {
  it("returns 0 for identical colors", () => {
    expect(colorDistance([255, 0, 0], [255, 0, 0])).toBeCloseTo(0, 3);
  });

  it("returns a positive value for different colors", () => {
    expect(colorDistance([255, 0, 0], [0, 0, 255])).toBeGreaterThan(10);
  });

  it("white-to-black distance is large", () => {
    expect(colorDistance([255, 255, 255], [0, 0, 0])).toBeGreaterThan(90);
  });
});

describe("rgbToHex", () => {
  it("converts red", () => expect(rgbToHex(255, 0, 0)).toBe("#ff0000"));
  it("converts black", () => expect(rgbToHex(0, 0, 0)).toBe("#000000"));
  it("converts white", () => expect(rgbToHex(255, 255, 255)).toBe("#ffffff"));
  it("clamps out-of-range values", () => {
    expect(rgbToHex(300, -10, 128)).toBe("#ff0080");
  });
});

describe("kMeansColors", () => {
  it("returns at most k centroids", () => {
    const pixels: [number, number, number][] = [
      [255, 0, 0], [200, 0, 0], [0, 0, 255], [0, 0, 200],
    ];
    const result = kMeansColors(pixels, 3);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("handles fewer pixels than k", () => {
    const pixels: [number, number, number][] = [[100, 100, 100]];
    const result = kMeansColors(pixels, 5);
    expect(result).toHaveLength(1);
  });

  it("returns empty for empty input", () => {
    expect(kMeansColors([], 5)).toHaveLength(0);
  });
});

describe("buildColorSamples", () => {
  it("builds ColorSample objects with correct hex", () => {
    const samples = buildColorSamples([[255, 0, 0], [0, 0, 255]]);
    expect(samples[0].hex).toBe("#ff0000");
    expect(samples[1].hex).toBe("#0000ff");
  });

  it("sets unknown role and empty sourceReferenceIds", () => {
    const samples = buildColorSamples([[128, 64, 32]]);
    expect(samples[0].role).toBe("unknown");
    expect(samples[0].sourceReferenceIds).toHaveLength(0);
  });
});

describe("getOrientation", () => {
  it("portrait when height > width", () =>
    expect(getOrientation(600, 800)).toBe("portrait"));
  it("landscape when width > height", () =>
    expect(getOrientation(800, 600)).toBe("landscape"));
  it("square when nearly equal", () =>
    expect(getOrientation(100, 100)).toBe("square"));
});

describe("getAspectRatio", () => {
  it("returns 1 for a square", () => expect(getAspectRatio(100, 100)).toBe(1));
  it("returns ~1.414 for A4", () =>
    expect(getAspectRatio(595, 842)).toBeCloseTo(0.707, 2));
});
