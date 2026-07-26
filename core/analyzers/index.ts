import type { ReferenceFile, ReferenceFeatures, ReferenceAnalyzer, SkippedFile } from "../types";
import { imageAnalyzer } from "./image";
import { svgAnalyzer } from "./svg";
import { pdfAnalyzer } from "./pdf";
import { textAnalyzer } from "./text";
import { defaultFeatures } from "./utils";

// ─────────────────────────────────────────────────────────────────────────────
// Analyzer registry — dispatches files to the correct analyzer
// ─────────────────────────────────────────────────────────────────────────────

const ANALYZERS: ReferenceAnalyzer[] = [
  imageAnalyzer,
  svgAnalyzer,
  pdfAnalyzer,
  textAnalyzer,
];

function getAnalyzer(file: ReferenceFile): ReferenceAnalyzer | null {
  return ANALYZERS.find((a) => a.canAnalyze(file)) ?? null;
}

/**
 * Merge a partial feature set with the defaults so every field is always defined.
 */
function mergeWithDefaults(partial: Partial<ReferenceFeatures>): ReferenceFeatures {
  const defaults = defaultFeatures() as ReferenceFeatures;
  return { ...defaults, ...partial };
}

export interface AnalyzerDispatchResult {
  features: ReferenceFeatures;
  skipped?: SkippedFile;
}

/**
 * Analyze a single file. Always returns a result — failures produce default features
 * and a SkippedFile entry rather than throwing.
 */
export async function analyzeFile(
  file: ReferenceFile,
  buffer: Buffer
): Promise<AnalyzerDispatchResult> {
  const analyzer = getAnalyzer(file);
  if (!analyzer) {
    return {
      features: mergeWithDefaults({}),
      skipped: {
        path: file.path,
        reason: "unsupported format",
        details: `No analyzer registered for MIME type "${file.mimeType}".`,
      },
    };
  }

  try {
    const partial = await analyzer.analyze(file, buffer);
    return { features: mergeWithDefaults(partial) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      features: mergeWithDefaults({}),
      skipped: {
        path: file.path,
        reason: "analysis failed",
        details: msg,
      },
    };
  }
}

export { getAnalyzer };
