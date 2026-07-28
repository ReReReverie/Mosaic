import type { ReferenceFile, ReferenceFeatures, ReferenceAnalyzer } from "../types";
import { buildColorSamples, getOrientation, getAspectRatio, rgbToHsl } from "./utils";

// ─────────────────────────────────────────────────────────────────────────────
// SVG Analyzer — extracts fill/stroke colors and viewBox dimensions
// ─────────────────────────────────────────────────────────────────────────────

const SUPPORTED_MIME = new Set(["image/svg+xml"]);

/** Parse all fill and stroke color values from SVG markup. */
function extractSvgColors(svg: string): [number, number, number][] {
  const hexColors: Set<string> = new Set();

  // Match #rrggbb and #rgb
  const hexPattern = /(?:fill|stroke)\s*[=:]\s*["']?(#[0-9a-fA-F]{3,8})\b/g;
  let m: RegExpExecArray | null;
  while ((m = hexPattern.exec(svg)) !== null) {
    hexColors.add(m[1].toLowerCase());
  }

  // Match rgb(r,g,b)
  const rgbPattern = /(?:fill|stroke)\s*[=:]\s*["']?rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/gi;
  while ((m = rgbPattern.exec(svg)) !== null) {
    hexColors.add(
      `#${[m[1], m[2], m[3]]
        .map((v) => parseInt(v).toString(16).padStart(2, "0"))
        .join("")}`
    );
  }

  const result: [number, number, number][] = [];
  for (const hex of hexColors) {
    const parsed = parseHex(hex);
    if (parsed) result.push(parsed);
  }
  return result;
}

function parseHex(hex: string): [number, number, number] | null {
  const h = hex.replace("#", "");
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  if (h.length === 6) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }
  return null;
}

/** Parse viewBox or width/height from SVG for dimensions. */
function extractSvgDimensions(svg: string): { w: number; h: number } {
  // viewBox="x y w h"
  const vb = svg.match(/viewBox\s*=\s*["']([^"']+)["']/i);
  if (vb) {
    const parts = vb[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      return { w: parts[2], h: parts[3] };
    }
  }
  // width/height attributes
  const wm = svg.match(/\bwidth\s*=\s*["']?(\d+(?:\.\d+)?)/i);
  const hm = svg.match(/\bheight\s*=\s*["']?(\d+(?:\.\d+)?)/i);
  const w = wm ? parseFloat(wm[1]) : 100;
  const h = hm ? parseFloat(hm[1]) : 100;
  return { w, h };
}

export const svgAnalyzer: ReferenceAnalyzer = {
  canAnalyze(file: ReferenceFile): boolean {
    return SUPPORTED_MIME.has(file.mimeType);
  },

  async analyze(
    _file: ReferenceFile,
    buffer: Buffer
  ): Promise<Partial<ReferenceFeatures>> {
    try {
      const svg = buffer.toString("utf-8");
      const rgbColors = extractSvgColors(svg);
      const colors = buildColorSamples(rgbColors.slice(0, 5));
      const { w, h } = extractSvgDimensions(svg);

      // Extract visible text content from SVG
      const textMatches = svg.match(/<text[^>]*>([\s\S]*?)<\/text>/gi) ?? [];
      const extractedText = textMatches
        .map((t) => t.replace(/<[^>]+>/g, " ").trim())
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 2);

      // Derive brightness and saturation from the extracted colour palette.
      // SVG colours are always exact (no JPEG artefacts), so this is accurate.
      let brightness = 0.5;
      let saturation = 0.1;
      if (rgbColors.length > 0) {
        let totalL = 0;
        let totalS = 0;
        for (const [r, g, b] of rgbColors) {
          const [, s, l] = rgbToHsl(r, g, b);
          totalL += l;
          totalS += s;
        }
        brightness = totalL / rgbColors.length;
        saturation = totalS / rgbColors.length;
      }

      // Edge density for SVG: proxy from colour count diversity.
      // Many distinct colours → busy vector artwork; few → minimal/flat icon.
      const edgeDensity = Math.min(1, rgbColors.length / 20);

      // Contrast proxy: spread of luminances across palette colours
      let contrast = 0.5;
      if (rgbColors.length > 1) {
        const lums = rgbColors.map(([r, g, b]) => rgbToHsl(r, g, b)[2]);
        const minL = Math.min(...lums);
        const maxL = Math.max(...lums);
        contrast = maxL - minL; // 0–1 already
      }

      return {
        colors,
        brightness,
        saturation,
        contrast,
        aspectRatio: getAspectRatio(w, h),
        orientation: getOrientation(w, h),
        subjectPlacement: "center",
        hasText: extractedText.length > 0,
        extractedText: [...new Set(extractedText)].slice(0, 30),
        fileQualityScore: 1.0, // SVGs are always vector-quality
        widthPx: w,
        heightPx: h,
        isIllustrative: true,
        edgeDensity,
      };
    } catch {
      return {};
    }
  },
};
