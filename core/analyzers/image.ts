import type { ReferenceFile, ReferenceFeatures, ReferenceAnalyzer } from "../types";
import {
  kMeansColors,
  buildColorSamples,
  getOrientation,
  getAspectRatio,
  rgbToHsl,
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
): Promise<{ pixels: [number, number, number][]; width: number; height: number }> {
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

  return { pixels, width: origW, height: origH };
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
      const { pixels, width, height } = await extractPixelSample(buffer, sharp);

      // Subsample pixels for speed (max 10k for k-means)
      const step = Math.max(1, Math.floor(pixels.length / 10000));
      const sampled = pixels.filter((_, i) => i % step === 0);

      const centroids = kMeansColors(sampled, 5);
      const colors = buildColorSamples(centroids);
      const { brightness, saturation } = calcBrightnessAndSaturation(sampled);
      const contrast = calcContrast(sampled);

      // Estimate sample dimensions from subsample length
      const sampleW = Math.min(SAMPLE_SIZE, width);
      const sampleH = Math.min(SAMPLE_SIZE, height);
      const subjectPlacement = estimateSubjectPlacement(
        pixels,
        width,
        height,
        sampleW,
        sampleH
      );

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
        hasText: false, // image analyzer doesn't detect text
        extractedText: [],
        fileQualityScore,
        widthPx: width,
        heightPx: height,
        isIllustrative: false,
      };
    } catch {
      return {};
    }
  },
};
