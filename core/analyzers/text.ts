import type { ReferenceFile, ReferenceFeatures, ReferenceAnalyzer } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Text Analyzer — TXT, MD, HTML, JSON, CSV
// Extracts keywords for prompt relevance scoring.
// ─────────────────────────────────────────────────────────────────────────────

const SUPPORTED_MIME = new Set([
  "text/plain",
  "text/markdown",
  "text/html",
  "text/csv",
  "application/json",
]);

// Common English stop words to filter out
const STOP_WORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with","by",
  "from","up","about","into","through","during","before","after","above","below",
  "is","was","are","were","be","been","being","have","has","had","do","does","did",
  "will","would","could","should","may","might","shall","can","need","dare",
  "this","that","these","those","it","its","they","them","their","he","she","we",
  "you","i","me","my","your","our","his","her","not","no","nor","so","yet","both",
  "either","neither","each","few","more","most","other","some","such","than","then",
  "too","very","just","also","as","if","while","when","where","who","which","what",
  "how","any","all","one","two","three","new","make","made","use","used","like",
  "get","got","go","went","come","came","take","took","see","saw","know","known",
]);

/** Strip HTML/Markdown tags and code fences */
function stripMarkup(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*_~[\]()>|]/g, " ")
    .replace(/https?:\/\/\S+/g, " ");
}

/** Attempt to flatten a JSON value to text */
function flattenJson(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (Array.isArray(value)) return value.map(flattenJson).join(" ");
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map(flattenJson)
      .join(" ");
  }
  return "";
}

/**
 * Tokenize text into lowercase words, remove stop words and short tokens.
 * Returns the top 30 by frequency.
 */
function extractKeywords(raw: string): string[] {
  const words = raw
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

export const textAnalyzer: ReferenceAnalyzer = {
  canAnalyze(file: ReferenceFile): boolean {
    return SUPPORTED_MIME.has(file.mimeType);
  },

  async analyze(
    file: ReferenceFile,
    buffer: Buffer
  ): Promise<Partial<ReferenceFeatures>> {
    try {
      const raw = buffer.toString("utf-8");
      let text = raw;

      if (file.mimeType === "application/json") {
        try {
          text = flattenJson(JSON.parse(raw));
        } catch {
          text = raw;
        }
      } else if (file.mimeType === "text/html") {
        text = stripMarkup(raw);
      } else if (file.mimeType === "text/markdown") {
        text = stripMarkup(raw);
      }

      const keywords = extractKeywords(text);

      return {
        colors: [],
        brightness: 0.5,
        saturation: 0,
        contrast: 0.5,
        aspectRatio: 1,
        orientation: "square",
        subjectPlacement: "center",
        hasText: keywords.length > 0,
        extractedText: keywords,
        fileQualityScore: keywords.length > 10 ? 0.8 : 0.4,
        widthPx: 0,
        heightPx: 0,
        isIllustrative: false,
      };
    } catch {
      return {};
    }
  },
};
