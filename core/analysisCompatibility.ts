import {
  ANALYZER_DIMENSIONS,
  type AnalysisResult,
  type AnalyzerDimension,
  type PromptAnalysis,
  type ReferenceEvaluation,
  type ReferenceSynthesis,
} from "./types";
import { interpretPromptAnalysisDeterministic } from "./promptAnalysis";
import { evaluateReference, synthesizeReferences } from "./referenceEvaluator";

const ALL_DIMENSIONS = new Set<AnalyzerDimension>([...ANALYZER_DIMENSIONS, "other"]);

function isPromptAnalysis(value: unknown): value is PromptAnalysis {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PromptAnalysis>;
  return typeof candidate.summary === "string" && Array.isArray(candidate.dimensions) && candidate.dimensions.every((dimension) => {
    if (!dimension || typeof dimension !== "object") return false;
    const item = dimension as PromptAnalysis["dimensions"][number];
    return ALL_DIMENSIONS.has(item.dimension) &&
      Array.isArray(item.details) &&
      item.details.every((detail) => typeof detail === "string") &&
      typeof item.specified === "boolean" &&
      (item.source === "prompt" || item.source === "default");
  });
}

function isReferenceEvaluation(value: unknown): value is ReferenceEvaluation {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ReferenceEvaluation>;
  return typeof candidate.overallMatchScore === "number" &&
    Array.isArray(candidate.dimensions) &&
    candidate.dimensions.every((dimension) => {
      if (!dimension || typeof dimension !== "object") return false;
      const item = dimension as ReferenceEvaluation["dimensions"][number];
      return ALL_DIMENSIONS.has(item.dimension) &&
        typeof item.applicable === "boolean" &&
        (item.score === null || typeof item.score === "number") &&
        typeof item.reason === "string" &&
        (item.source === "prompt" || item.source === "default");
    }) &&
    Array.isArray(candidate.strongFor) &&
    candidate.strongFor.every((note) => typeof note === "string") &&
    Array.isArray(candidate.weakFor) &&
    candidate.weakFor.every((note) => typeof note === "string");
}

function isReferenceSynthesis(value: unknown): value is ReferenceSynthesis {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ReferenceSynthesis>;
  return typeof candidate.summary === "string" &&
    Array.isArray(candidate.suggestedCombination) &&
    Array.isArray(candidate.coverageGaps) &&
    Array.isArray(candidate.conflicts);
}

/** Fill the additive artist-analysis fields on older persisted results. */
export function normalizeAnalysisResult(result: AnalysisResult): AnalysisResult {
  const promptAnalysis = isPromptAnalysis(result.promptAnalysis)
    ? result.promptAnalysis
    : interpretPromptAnalysisDeterministic(result.brief);

  const references = result.references.map((reference) => ({
    ...reference,
    referenceEvaluation: isReferenceEvaluation(reference.referenceEvaluation)
      ? reference.referenceEvaluation
      : evaluateReference(reference.file, reference.features, promptAnalysis),
  }));

  const referenceSynthesis = isReferenceSynthesis(result.referenceSynthesis)
    ? result.referenceSynthesis
    : synthesizeReferences(references, promptAnalysis);

  return {
    ...result,
    promptAnalysis,
    references,
    referenceSynthesis,
  };
}
