import type { ReferenceFeatures, ColorSample } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Shared color and feature utilities used by multiple analyzers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert an RGB triple to an HSL triple.
 * h: 0–360, s: 0–1, l: 0–1
 */
export function rgbToHsl(
  r: number,
  g: number,
  b: number
): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case rn:
      h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
      break;
    case gn:
      h = ((bn - rn) / d + 2) / 6;
      break;
    case bn:
      h = ((rn - gn) / d + 4) / 6;
      break;
  }
  return [h * 360, s, l];
}

/**
 * Convert RGB to CIE Lab (D65 illuminant).
 */
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const linearize = (c: number) => {
    const n = c / 255;
    return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
  };
  const lr = linearize(r);
  const lg = linearize(g);
  const lb = linearize(b);
  // D65 reference
  const X = (lr * 0.4124 + lg * 0.3576 + lb * 0.1805) / 0.95047;
  const Y = (lr * 0.2126 + lg * 0.7152 + lb * 0.0722) / 1.0;
  const Z = (lr * 0.0193 + lg * 0.1192 + lb * 0.9505) / 1.08883;
  const f = (t: number) =>
    t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const L = 116 * f(Y) - 16;
  const a = 500 * (f(X) - f(Y));
  const bLab = 200 * (f(Y) - f(Z));
  return [L, a, bLab];
}

/**
 * CIE76 delta-E between two RGB colors.
 */
export function colorDistance(
  [r1, g1, b1]: [number, number, number],
  [r2, g2, b2]: [number, number, number]
): number {
  const [L1, a1, b1L] = rgbToLab(r1, g1, b1);
  const [L2, a2, b2L] = rgbToLab(r2, g2, b2);
  return Math.sqrt(
    Math.pow(L2 - L1, 2) + Math.pow(a2 - a1, 2) + Math.pow(b2L - b1L, 2)
  );
}

export function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0"))
      .join("")
  );
}

/**
 * K-means color quantization.
 * pixels: array of [r,g,b] tuples
 * k: number of clusters (default 5)
 */
export function kMeansColors(
  pixels: [number, number, number][],
  k = 5,
  maxIterations = 30
): [number, number, number][] {
  if (pixels.length === 0) return [];
  const actual = Math.min(k, pixels.length);

  // Initialise centroids with k-means++ strategy
  const centroids: [number, number, number][] = [
    pixels[Math.floor(Math.random() * pixels.length)],
  ];
  while (centroids.length < actual) {
    const distances = pixels.map((p) =>
      Math.min(...centroids.map((c) => colorDistance(p, c)))
    );
    const total = distances.reduce((a, b) => a + b, 0);
    let rand = Math.random() * total;
    for (let i = 0; i < distances.length; i++) {
      rand -= distances[i];
      if (rand <= 0) {
        centroids.push(pixels[i]);
        break;
      }
    }
  }

  let assignments = new Array(pixels.length).fill(0);
  for (let iter = 0; iter < maxIterations; iter++) {
    const newAssignments = pixels.map((p) => {
      let minDist = Infinity;
      let bestIdx = 0;
      for (let ci = 0; ci < centroids.length; ci++) {
        const d = colorDistance(p, centroids[ci]);
        if (d < minDist) {
          minDist = d;
          bestIdx = ci;
        }
      }
      return bestIdx;
    });

    // Update centroids
    for (let ci = 0; ci < centroids.length; ci++) {
      const cluster = pixels.filter((_, i) => newAssignments[i] === ci);
      if (cluster.length > 0) {
        centroids[ci] = [
          cluster.reduce((s, p) => s + p[0], 0) / cluster.length,
          cluster.reduce((s, p) => s + p[1], 0) / cluster.length,
          cluster.reduce((s, p) => s + p[2], 0) / cluster.length,
        ];
      }
    }

    const changed = newAssignments.some((a, i) => a !== assignments[i]);
    assignments = newAssignments;
    if (!changed) break;
  }

  // Sort by cluster size descending (most dominant first)
  const counts = centroids.map((_, ci) =>
    assignments.filter((a) => a === ci).length
  );
  return centroids
    .map((c, i) => ({ c, count: counts[i] }))
    .sort((a, b) => b.count - a.count)
    .map(({ c }) => [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])] as [number, number, number]);
}

/**
 * Build a ColorSample array from an array of RGB centroids.
 */
export function buildColorSamples(
  centroids: [number, number, number][]
): ColorSample[] {
  return centroids.map((rgb) => ({
    hex: rgbToHex(...rgb),
    rgb,
    role: "unknown" as const,
    sourceReferenceIds: [],
    contrastWarnings: [],
  }));
}

/**
 * Determine portrait/landscape/square from dimensions.
 */
export function getOrientation(
  w: number,
  h: number
): ReferenceFeatures["orientation"] {
  const ratio = w / h;
  if (ratio < 0.95) return "portrait";
  if (ratio > 1.05) return "landscape";
  return "square";
}

/**
 * Estimate aspect ratio as width / height, rounded to 3 dp.
 */
export function getAspectRatio(w: number, h: number): number {
  return Math.round((w / h) * 1000) / 1000;
}

/**
 * Default partial features — returned when nothing was extractable.
 */
export function defaultFeatures(): Partial<ReferenceFeatures> {
  return {
    colors: [],
    brightness: 0.5,
    saturation: 0.3,
    contrast: 0.5,
    aspectRatio: 1,
    orientation: "square",
    subjectPlacement: "center",
    hasText: false,
    extractedText: [],
    fileQualityScore: 0.3,
    widthPx: 0,
    heightPx: 0,
    isIllustrative: false,
  };
}
