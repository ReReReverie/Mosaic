import crypto from "crypto";
import type {
  ReferenceFile,
  ScoringWeights,
  AnalysisResult,
  ProgressEvent,
  CreativeConstraint,
  SkippedFile,
} from "./types";
import { DEFAULT_SCORING_WEIGHTS } from "./types";
import { analyzeFile } from "./analyzers/index";
import { interpretPrompt } from "./promptInterpreter";
import { rankReferences } from "./ranker";
import { analyzeStyleDNA } from "./styleDNA";
import { analyzeDiversity } from "./diversityAnalyzer";
import { generatePalettes } from "./paletteEngine";
import { checkAccessibility } from "./accessibilityChecker";
import { AiProviderError, type AiProviderConfig } from "./aiProvider";

// ─────────────────────────────────────────────────────────────────────────────
// Analysis Orchestrator
// Wires all core modules together into a single streaming pipeline.
// ─────────────────────────────────────────────────────────────────────────────

export interface OrchestratorInput {
  files: ReferenceFile[];
  brief: string;
  weights?: ScoringWeights;
  aiProvider?: AiProviderConfig;
  pinnedIds?: string[];
  removedIds?: string[];
  constraints?: CreativeConstraint[];
  /** Optional multimodal enrichment. Failures are reported and fall back. */
  analyzeVision?: (
    file: ReferenceFile,
    buffer: Buffer,
    brief: string,
    features: import("./types").ReferenceFeatures
  ) => Promise<Partial<import("./types").ReferenceFeatures> | null>;
  preSkippedFiles?: SkippedFile[];
  /**
   * Function that reads a file's contents by id and path.
   * Injected so the orchestrator stays platform-neutral.
   */
  readFile: (file: ReferenceFile) => Promise<Buffer>;
}

const BATCH_SIZE = 10;
const DEFAULT_AI_MAX_CONCURRENCY = 4;
const MAX_AI_CONCURRENCY = 4;
const TOP_REFERENCES = 12;

export function getAiMaxConcurrency(): number {
  const configured = process.env.MOSAIC_AI_MAX_CONCURRENCY?.trim();
  if (!configured) return DEFAULT_AI_MAX_CONCURRENCY;

  const parsed = Number(configured);
  if (!Number.isFinite(parsed)) return DEFAULT_AI_MAX_CONCURRENCY;

  return Math.min(MAX_AI_CONCURRENCY, Math.max(1, Math.floor(parsed)));
}

function isRateLimitError(error: unknown): boolean {
  if (error instanceof AiProviderError) return error.status === 429;
  if (typeof error !== "object" || error === null || !("status" in error)) return false;

  return (error as { status?: unknown }).status === 429;
}

export async function* runAnalysis(
  input: OrchestratorInput
): AsyncGenerator<ProgressEvent> {
  const {
    files,
    brief,
    weights = DEFAULT_SCORING_WEIGHTS,
    aiProvider,
    pinnedIds = [],
    removedIds = [],
    constraints = [],
    analyzeVision,
    preSkippedFiles = [],
    readFile,
  } = input;

  const sessionId = crypto.randomUUID();

  // ── 1. Interpret prompt ──────────────────────────────────────────────────
  yield {
    type: "file-analysis-progress",
    progress: 2,
    message: "Interpreting brief…",
  };
  const creativeDirection = {
    ...(await interpretPrompt(brief, aiProvider)),
    constraints,
  };

  // ── 2. Analyse files in batches ──────────────────────────────────────────
  yield {
    type: "scan-complete",
    progress: 5,
    message: `Scanning ${files.length} file${files.length !== 1 ? "s" : ""}…`,
  };

  const featuresMap = new Map<string, import("./types").ReferenceFeatures>();
  const skippedFiles: AnalysisResult["skippedFiles"] = [...preSkippedFiles];

  const totalFiles = files.length;
  let processed = 0;
  let aiRequested = 0;
  let aiVisionCompleted = 0;
  let aiTextFallback = 0;
  let aiFailed = 0;
  let aiSkipped = 0;
  const aiErrors: string[] = [];

  type FileAnalysisOutcome = { rateLimited: boolean };
  const analyzeOne = async (file: ReferenceFile): Promise<FileAnalysisOutcome> => {
    let rateLimited = false;
    try {
      const buffer = await readFile(file);
      const { features, skipped } = await analyzeFile(file, buffer);
      if (skipped) {
        skippedFiles.push(skipped);
      } else {
        let enrichedFeatures = features;
        if (analyzeVision && file.mimeType.startsWith("image/")) {
          aiRequested += 1;
          try {
            const semanticFeatures = await analyzeVision(file, buffer, brief, features);
            if (semanticFeatures) {
              enrichedFeatures = {
                ...features,
                ...semanticFeatures,
                analysisSource: semanticFeatures.analysisSource ?? "mixed",
              };
              if (semanticFeatures.analysisSource === "ai-text") aiTextFallback += 1;
              else aiVisionCompleted += 1;
            } else {
              aiSkipped += 1;
            }
          } catch (error) {
            rateLimited = isRateLimitError(error);
            aiFailed += 1;
            if (aiErrors.length < 3) {
              const details = error instanceof Error ? error.message : "Unknown AI provider error.";
              aiErrors.push(`${file.filename}: ${details.slice(0, 240)}`);
            }
          }
        }
        featuresMap.set(file.id, enrichedFeatures);
      }
    } catch (err) {
      skippedFiles.push({
        path: file.path,
        reason: "analysis failed",
        details: err instanceof Error ? err.message : String(err),
      });
    }
    return { rateLimited };
  };

  const rankAvailableReferences = () => rankReferences(
    files,
    featuresMap,
    creativeDirection,
    weights,
    new Set(pinnedIds),
    new Set(removedIds),
    constraints
  );

  if (!analyzeVision) {
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (file) => {
        await analyzeOne(file);
        processed += 1;
      }));

      const progress =
        totalFiles === 0 ? 65 : 5 + Math.round((processed / totalFiles) * 60);
      yield {
        type: "file-analysis-progress",
        progress,
        message: `Analysed ${processed} / ${totalFiles} files…`,
        partialReferences: rankAvailableReferences(),
      };
    }
  } else {
    let nextIndex = 0;
    let targetConcurrency = getAiMaxConcurrency();
    const inFlight = new Map<number, Promise<{ index: number; outcome: FileAnalysisOutcome }>>();

    const startNext = () => {
      while (nextIndex < files.length && inFlight.size < targetConcurrency) {
        const index = nextIndex;
        nextIndex += 1;
        const task = analyzeOne(files[index]).then((outcome) => ({ index, outcome }));
        inFlight.set(index, task);
      }
    };

    startNext();
    while (inFlight.size > 0) {
      const completed = await Promise.race(inFlight.values());
      inFlight.delete(completed.index);
      processed += 1;

      if (completed.outcome.rateLimited) {
        targetConcurrency = Math.max(1, Math.ceil(targetConcurrency / 2));
      }
      startNext();

      const progress =
        totalFiles === 0 ? 65 : 5 + Math.round((processed / totalFiles) * 60);
      yield {
        type: "file-analysis-progress",
        progress,
        message: `Analysed ${processed} / ${totalFiles} files…`,
        partialReferences: rankAvailableReferences(),
      };
    }
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
    new Set(removedIds),
    constraints
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
  const accessibilityFindings = checkAccessibility(
    top,
    palette,
    creativeDirection.constraints
  );

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
    aiAnalysis: {
      enabled: Boolean(aiProvider && analyzeVision),
      provider: aiProvider?.provider,
      requested: aiRequested,
      visionCompleted: aiVisionCompleted,
      textFallback: aiTextFallback,
      failed: aiFailed,
      skipped: aiSkipped,
      errors: aiErrors,
    },
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
