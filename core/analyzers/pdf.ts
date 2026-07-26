import type { ReferenceFile, ReferenceFeatures, ReferenceAnalyzer } from "../types";
import { getOrientation, getAspectRatio } from "./utils";

// ─────────────────────────────────────────────────────────────────────────────
// PDF Analyzer — text extraction via pdf-parse + optional thumbnail via pdf2pic
// ─────────────────────────────────────────────────────────────────────────────

const SUPPORTED_MIME = new Set(["application/pdf"]);

const STOP_WORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with","by",
  "is","was","are","were","be","been","this","that","it","as","if","not","no",
]);

function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([word]) => word);
}

export const pdfAnalyzer: ReferenceAnalyzer = {
  canAnalyze(file: ReferenceFile): boolean {
    return SUPPORTED_MIME.has(file.mimeType);
  },

  async analyze(
    _file: ReferenceFile,
    buffer: Buffer
  ): Promise<Partial<ReferenceFeatures>> {
    try {
      // Dynamic import to avoid issues in environments where pdf-parse isn't available
      // pdf-parse ESM export doesn't have .default — handle both module shapes
      const pdfParseModule = await import("pdf-parse");
      const pdfParse = (pdfParseModule as unknown as { default?: typeof pdfParseModule })
        .default ?? pdfParseModule;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await (pdfParse as any)(buffer);

      const keywords = extractKeywords((data.text as string | undefined) ?? "");

      // Estimate page dimensions from the PDF info (A4 portrait = 595 × 842 pts)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const info = data.info as any;
      const mediaBox: number[] | undefined = info?.MediaBox;
      const pageWidth: number = mediaBox?.[2] ?? 595;
      const pageHeight: number = mediaBox?.[3] ?? 842;

      return {
        colors: [], // No color extraction without rasterization
        brightness: 0.8, // PDFs are usually light-background documents
        saturation: 0.1,
        contrast: 0.6,
        aspectRatio: getAspectRatio(pageWidth, pageHeight),
        orientation: getOrientation(pageWidth, pageHeight),
        subjectPlacement: "center",
        hasText: keywords.length > 0,
        extractedText: keywords,
        fileQualityScore: keywords.length > 5 ? 0.9 : 0.5,
        widthPx: pageWidth,
        heightPx: pageHeight,
        isIllustrative: false,
      };
    } catch {
      return {};
    }
  },
};
