import crypto from "crypto";
import type {
  ReferenceFile,
  ScoringWeights,
  AnalysisResult,
  RankedReference,
  ProgressEvent,
} from "./types";
import { DEFAULT_SCORING_WEIGHTS } from "./types";
import { analyzeFile } from "./analyzers/index";
import { interpretPrompt } from "./promptInterpreter";
import { rankReferences } from "./ranker";
import { analyzeStyleDNA } from "./styleDNA";
import { analyzeDiversity } from "./diversityAnalyzer";
import { generatePalettes } from "./paletteEngine";
import { checkAccessibility } from "./accessibilityChecker";

// ─────────────────────────────────────────────────────────────────────────────
// Analysis Orchestrator
// Wires all core modules together into a single streaming pipeline.
// ─────────────────────────────────────────────────────────────────────────────

export interface OrchestratorInput {
  files: ReferenceFile[];
  brief: string;
  weights?: ScoringWeights;
  apiKey?: string;
  pinnedIds?: string[];
  removedIds?: string[];
  /**
   * Function that reads a file's contents by id and path.
   * Injected so the orchestrator stays platform-neutral.
   */
  readFile: (file: ReferenceFile) => Promise<Buffer>;
}

const BATCH_SIZE = 10;
const TOP_REFERENCES = 12;

export async function* runAnalysis(
  input: OrchestratorInput
): AsyncGenerator<ProgressEvent> {
  const {
    files,
    brief,
    weights = DEFAULT_SCORING_WEIGHTS,
    apiKey,
    pinnedIds = [],
    removedIds = [],
    readFile,
  } = input;

  const sessionId = crypto.randomUUID();

  // ── 1. Interpret prompt ──────────────────────────────────────────────────
  yield {
    type: "file-analysis-progress",
    progress: 2,
    message: "Interpreting brief…",
  };
  const creativeDirection = await interpretPrompt(brief, apiKey);

  // ── 2. Analyse files in batches ──────────────────────────────────────────
  yield {
    type: "scan-complete",
    progress: 5,
    message: `Scanning ${files.length} file${files.length !== 1 ? "s" : ""}…`,
  };

  const featuresMap = new Map<string, import("./types").ReferenceFeatures>();
  const skippedFiles: AnalysisResult["skippedFiles"] = [];

  const totalFiles = files.length;
  let processed = 0;

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (file) => {
        try {
          const buffer = await readFile(file);
          const { features, skipped } = await analyzeFile(file, buffer);
          if (skipped) {
            skippedFiles.push(skipped);
          } else {
            featuresMap.set(file.id, features);
          }
        } catch (err) {
          skippedFiles.push({
            path: file.path,
            reason: "analysis failed",
            details: err instanceof Error ? err.message : String(err),
          });
        }
        processed++;
      })
    );

    const progress = 5 + Math.round((processed / totalFiles) * 60);
    yield {
      type: "file-analysis-progress",
      progress,
      message: `Analysed ${processed} / ${totalFiles} files…`,
    };
  }

  // ── 3. Rank references ────────────────────────────────────────────────────
  yield {
    type: "file-analysis-progress",
    progress: 68,
    message: "Ranking references…",
  };

  const allRanked = rankReferences(
    files,
    featuresMap as Map<string, import("./types").ReferenceFeatures>,
    creativeDirection,
    weights,
    new Set(pinnedIds),
    new Set(removedIds)
  );

  yield {
    type: "ranking-complete",
    progress: 75,
    message: `Ranked ${allRanked.length} references.`,
  };

  // ── 4. Style DNA ──────────────────────────────────────────────────────────
  const top = allRanked.slice(0, TOP_REFERENCES);
  const styleDNA = analyzeStyleDNA(top);

  yield {
    type: "style-dna-complete",
    progress: 82,
    message: "Style DNA analysis complete.",
  };

  // ── 5. Diversity ──────────────────────────────────────────────────────────
  const diversitySuggestions = analyzeDiversity(top, allRanked);

  yield {
    type: "diversity-complete",
    progress: 86,
    message: `Found ${diversitySuggestions.length} diversity suggestion${diversitySuggestions.length !== 1 ? "s" : ""}.`,
  };

  // ── 6. Palette ────────────────────────────────────────────────────────────
  const palette = generatePalettes(top);

  yield {
    type: "palette-complete",
    progress: 92,
    message: "Palette recommendations generated.",
  };

  // ── 7. Accessibility ──────────────────────────────────────────────────────
  const accessibilityFindings = checkAccessibility(top, palette, []);

  yield {
    type: "accessibility-complete",
    progress: 97,
    message: `Accessibility check complete. ${accessibilityFindings.length} finding${accessibilityFindings.length !== 1 ? "s" : ""}.`,
  };

  // ── 8. Done ───────────────────────────────────────────────────────────────
  const result: AnalysisResult = {
    sessionId,
    brief,
    creativeDirection,
    references: allRanked,
    styleDNA,
    diversitySuggestions,
    palette,
    accessibilityFindings,
    skippedFiles,
    scoringWeights: weights,
    analyzedAt: Date.now(),
  };

  yield {
    type: "done",
    progress: 100,
    message: "Analysis complete.",
    result,
  };
}
