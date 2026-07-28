import type { ReferenceFile, ReferenceFeatures, ReferenceAnalyzer } from "../types";
import {
  kMeansColors,
  buildColorSamples,
  getOrientation,
  getAspectRatio,
  rgbToHsl,
  colorDistance,
} from "./utils";

// ─────────────────────────────────────────────────────────────────────────────
// Image analyzer — PNG, JPEG, WebP, GIF, BMP, TIFF
// Uses Sharp (server-side only).
// ─────────────────────────────────────────────────────────────────────────────

const SUPPORTED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/tiff",
]);

const SAMPLE_SIZE = 400; // px — max dimension for color sampling

async function getSharp() {
  // Dynamic import keeps Sharp out of the client bundle
  const sharp = (await import("sharp")).default;
  return sharp;
}

async function extractPixelSample(
  buffer: Buffer,
  sharp: Awaited<ReturnType<typeof getSharp>>
): Promise<{ pixels: [number, number, number][]; width: number; height: number; sampleWidth: number; sampleHeight: number }> {
  const img = sharp(buffer);
  const meta = await img.metadata();
  const origW = meta.width ?? 1;
  const origH = meta.height ?? 1;

  // Resize to a small sample for fast color extraction
  const { data, info } = await img
    .resize({ width: SAMPLE_SIZE, height: SAMPLE_SIZE, fit: "inside" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels: [number, number, number][] = [];
  const channels = info.channels; // 3 (RGB) or 4 (RGBA)
  for (let i = 0; i < data.length; i += channels) {
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }

  return { pixels, width: origW, height: origH, sampleWidth: info.width, sampleHeight: info.height };
}

/**
 * Estimate subject placement from the distribution of darker/more saturated pixels.
 * Splits the image into a 3×3 grid and finds which zone has the most "interesting" pixels.
 */
function estimateSubjectPlacement(
  pixels: [number, number, number][],
  width: number,
  height: number,
  sampleWidth: number,
  sampleHeight: number
): ReferenceFeatures["subjectPlacement"] {
  // Weight pixels by saturation (more saturated = more likely to be subject)
  const gridW = sampleWidth / 3;
  const gridH = sampleHeight / 3;
  const zones = new Array(9).fill(0);

  pixels.forEach((p, i) => {
    const col = Math.floor((i % sampleWidth) / gridW);
    const row = Math.floor(Math.floor(i / sampleWidth) / gridH);
    const zoneIdx = Math.min(row, 2) * 3 + Math.min(col, 2);
    const [, s] = rgbToHsl(p[0], p[1], p[2]);
    zones[zoneIdx] += s;
  });

  const maxZone = zones.indexOf(Math.max(...zones));
  const row = Math.floor(maxZone / 3);
  const col = maxZone % 3;

  if (row === 1 && col === 1) return "center";
  if (row === 0) return "top";
  if (row === 2) return "bottom";
  if (col === 0) return "left";
  if (col === 2) return "right";
  return "distributed";
}

/**
 * Calculate mean brightness (luminance) and saturation of a pixel array.
 */
function calcBrightnessAndSaturation(
  pixels: [number, number, number][]
): { brightness: number; saturation: number } {
  let totalL = 0;
  let totalS = 0;
  for (const [r, g, b] of pixels) {
    const [, s, l] = rgbToHsl(r, g, b);
    totalL += l;
    totalS += s;
  }
  return {
    brightness: totalL / pixels.length,
    saturation: totalS / pixels.length,
  };
}

/**
 * Estimate contrast as the standard deviation of luminance values.
 */
function calcContrast(pixels: [number, number, number][]): number {
  const luminances = pixels.map(([r, g, b]) => {
    const [, , l] = rgbToHsl(r, g, b);
    return l;
  });
  const mean = luminances.reduce((a, b) => a + b, 0) / luminances.length;
  const variance =
    luminances.reduce((a, l) => a + Math.pow(l - mean, 2), 0) / luminances.length;
  return Math.sqrt(variance); // 0–0.5 range in practice
}

/**
 * Detect whether an image is illustrative (flat-colour art, manga, vector render)
 * rather than a photograph, by measuring k-means cluster tightness.
 *
 * Logic: photographs have many fine colour gradations → pixels spread far from
 * their centroids. Illustrations / flat-art images have large regions of near-
 * identical colour → most pixels sit very close to their centroid.
 *
 * We run a 6-centroid k-means on a subsample and compute the mean CIE76 distance
 * of every pixel to its nearest centroid.  If the mean distance is below the
 * threshold (i.e. tight clusters), the image is illustrative.
 *
 * Threshold of ~18 (on a 0–100 CIE76 scale) distinguishes flat art reliably
 * without being thrown off by anti-aliasing artefacts.
 */
function detectIsIllustrative(sampled: [number, number, number][]): boolean {
  if (sampled.length < 20) return false;

  const centroids = kMeansColors(sampled, 6);
  if (centroids.length === 0) return false;

  // Compute mean distance from each pixel to its nearest centroid
  let totalDist = 0;
  for (const px of sampled) {
    const minDist = Math.min(...centroids.map((c) => colorDistance(px, c)));
    totalDist += minDist;
  }
  const meanDist = totalDist / sampled.length;

  // Flat illustrations: meanDist < 18; photos: typically 25–45
  return meanDist < 18;
}

/**
 * Detect whether an image likely contains significant text using a luminance
 * row-variance proxy.  Text lines create alternating light/dark horizontal bands
 * (high variance row-to-row) that are distinctive from photographic content.
 *
 * Algorithm:
 *   1. Compute mean luminance per row.
 *   2. Compute first-order differences between consecutive row means.
 *   3. If the standard deviation of those differences is above a threshold
 *      AND the fraction of rows with a sign-flip (oscillating pattern) is
 *      high enough, classify as text-bearing.
 */
function detectHasText(
  pixels: [number, number, number][],
  sampleWidth: number,
  sampleHeight: number
): boolean {
  if (sampleHeight < 10 || sampleWidth < 10) return false;

  // Mean luminance per row
  const rowMeans: number[] = [];
  for (let row = 0; row < sampleHeight; row++) {
    let sum = 0;
    for (let col = 0; col < sampleWidth; col++) {
      const idx = row * sampleWidth + col;
      if (idx >= pixels.length) break;
      const [, , l] = rgbToHsl(pixels[idx][0], pixels[idx][1], pixels[idx][2]);
      sum += l;
    }
    rowMeans.push(sum / sampleWidth);
  }

  // First-order differences
  const diffs: number[] = [];
  for (let i = 1; i < rowMeans.length; i++) {
    diffs.push(rowMeans[i] - rowMeans[i - 1]);
  }

  // Std-dev of differences
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const variance =
    diffs.reduce((a, d) => a + Math.pow(d - mean, 2), 0) / diffs.length;
  const stdDev = Math.sqrt(variance);

  // Count sign-flips (oscillating pattern characteristic of text lines)
  let signFlips = 0;
  for (let i = 1; i < diffs.length; i++) {
    if (diffs[i] * diffs[i - 1] < 0) signFlips++;
  }
  const flipFraction = signFlips / (diffs.length - 1);

  // Text-bearing: high oscillation AND meaningful amplitude
  return stdDev > 0.04 && flipFraction > 0.45;
}

/**
 * Compute edge density as the fraction of pixels that differ significantly
 * (CIE76 > threshold) from the pixel immediately to their right or below.
 * High = busy / textured; low = flat / minimal.
 *
 * We use a fast RGB approximation (squared Euclidean in RGB/255 space) instead
 * of full CIE76 here because it's called on every pixel pair.
 * Threshold ~0.05² ≈ 12.75 in 0–255 squared space.
 */
function calcEdgeDensity(
  pixels: [number, number, number][],
  sampleWidth: number,
  sampleHeight: number
): number {
  if (pixels.length < 4) return 0.3;

  const threshold = 1500; // squared RGB diff in 0–255 space (~39 per channel)
  let edgeCount = 0;
  let comparisons = 0;

  for (let row = 0; row < sampleHeight; row++) {
    for (let col = 0; col < sampleWidth; col++) {
      const idx = row * sampleWidth + col;
      if (idx >= pixels.length) continue;
      const [r, g, b] = pixels[idx];

      // Right neighbour
      if (col + 1 < sampleWidth) {
        const ridx = idx + 1;
        if (ridx < pixels.length) {
          const [r2, g2, b2] = pixels[ridx];
          const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
          if (d > threshold) edgeCount++;
          comparisons++;
        }
      }

      // Bottom neighbour
      if (row + 1 < sampleHeight) {
        const bidx = (row + 1) * sampleWidth + col;
        if (bidx < pixels.length) {
          const [r2, g2, b2] = pixels[bidx];
          const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
          if (d > threshold) edgeCount++;
          comparisons++;
        }
      }
    }
  }

  return comparisons > 0 ? edgeCount / comparisons : 0.3;
}

export const imageAnalyzer: ReferenceAnalyzer = {
  canAnalyze(file: ReferenceFile): boolean {
    return SUPPORTED_MIME.has(file.mimeType);
  },

  async analyze(
    file: ReferenceFile,
    buffer: Buffer
  ): Promise<Partial<ReferenceFeatures>> {
    try {
      const sharp = await getSharp();
      const { pixels, width, height, sampleWidth, sampleHeight } =
        await extractPixelSample(buffer, sharp);

      // Subsample pixels for speed (max 10k for k-means)
      const step = Math.max(1, Math.floor(pixels.length / 10000));
      const sampled = pixels.filter((_, i) => i % step === 0);

      const centroids = kMeansColors(sampled, 5);
      const colors = buildColorSamples(centroids);
      const { brightness, saturation } = calcBrightnessAndSaturation(sampled);
      const contrast = calcContrast(sampled);

      const subjectPlacement = estimateSubjectPlacement(
        pixels,
        width,
        height,
        sampleWidth,
        sampleHeight
      );

      // Pixel-level heuristics
      const isIllustrative = detectIsIllustrative(sampled);
      const hasText = detectHasText(pixels, sampleWidth, sampleHeight);
      const edgeDensity = calcEdgeDensity(pixels, sampleWidth, sampleHeight);

      // Resolution quality: DPI proxy using pixel area
      const megapixels = (width * height) / 1_000_000;
      const fileQualityScore = Math.min(1, megapixels / 8); // 8 MP = full score

      return {
        colors,
        brightness,
        saturation,
        contrast: Math.min(1, contrast * 2), // normalise to 0–1
        aspectRatio: getAspectRatio(width, height),
        orientation: getOrientation(width, height),
        subjectPlacement,
        hasText,
        extractedText: [],
        fileQualityScore,
        widthPx: width,
        heightPx: height,
        isIllustrative,
        edgeDensity,
      };
    } catch {
      return {};
    }
  },
};
