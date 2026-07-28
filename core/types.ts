// ─────────────────────────────────────────────────────────────────────────────
// Core types for the Creative Reference Assistant
// All types are plain JSON-serialisable objects (no File, Buffer, or DOM types).
// ─────────────────────────────────────────────────────────────────────────────

// ── File & Features ──────────────────────────────────────────────────────────

export interface ReferenceFile {
  /** Stable SHA-256-derived id from path + size + lastModified */
  id: string;
  /** Original absolute or relative path */
  path: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  lastModified: number;
}

export interface ColorSample {
  hex: string;
  rgb: [number, number, number];
  /** Semantic role assigned by the palette engine */
  role: "background" | "surface" | "primary" | "accent" | "text" | "unknown";
  /** Reference IDs that contributed this color */
  sourceReferenceIds: string[];
  /** WCAG contrast warnings paired against other colors in the same palette */
  contrastWarnings: ContrastWarning[];
}

export interface ContrastWarning {
  pairedWith: string; // hex value of the other color
  ratio: number;
  failsAA: boolean;
  failsAAA: boolean;
}

export interface ReferenceFeatures {
  /** Up to 5 dominant colors (k-means centroids) */
  colors: ColorSample[];
  /** 0–1, mean luminance */
  brightness: number;
  /** 0–1, mean HSL saturation */
  saturation: number;
  /** 0–1, RMS contrast proxy */
  contrast: number;
  /** e.g. 1.414 for A4 */
  aspectRatio: number;
  orientation: "portrait" | "landscape" | "square";
  subjectPlacement: "center" | "top" | "bottom" | "left" | "right" | "distributed";
  hasText: boolean;
  /** Top keywords extracted from the file */
  extractedText: string[];
  /** 0–1 composite of resolution, metadata completeness */
  fileQualityScore: number;
  /** Width in pixels (or logical units for SVG) */
  widthPx: number;
  /** Height in pixels (or logical units for SVG) */
  heightPx: number;
  /** true for SVG / illustration, false for raster photo */
  isIllustrative: boolean;
  /**
   * 0–1 fraction of pixels that differ significantly from their neighbours.
   * High = busy/textured; low = flat/minimal.
   */
  edgeDensity: number;
  /** Optional semantic evidence supplied by a multimodal provider. */
  semanticDescription?: string;
  /** AI's explanation of how the visible evidence supports the brief. */
  semanticRationale?: string;
  /** Short, visible observations used by the AI to reach its match judgment. */
  semanticEvidence?: string[];
  semanticTags?: string[];
  semanticMatch?: number;
  semanticConfidence?: number;
  analysisSource?: "deterministic" | "vision" | "ai-text" | "mixed";
}

// ── Creative Direction ────────────────────────────────────────────────────────

export type FormatType =
  | "poster"
  | "logo"
  | "website"
  | "social"
  | "branding"
  | "editorial"
  | "print"
  | "screen"
  | "other";

export type OutputType = "print" | "screen" | "both";

export type AccessibilityStandard = "AA" | "AAA";

export interface CreativeConstraint {
  type:
    | "format"
    | "output"
    | "aspectRatio"
    | "minResolution"
    | "maxColors"
    | "brandColor"
    | "audience"
    | "accessibilityStandard"
    | "moodIntensity";
  value: string | number;
  description: string;
}

export interface CreativeDirection {
  subject: string[];
  audience: string[];
  mood: string[];
  style: string[];
  colors: string[];
  formats: string[];
  constraints: CreativeConstraint[];
  /** Detected conflicts or missing information in the brief */
  ambiguities: string[];
}

// ── Scoring ───────────────────────────────────────────────────────────────────

export interface ScoringWeights {
  /** All five must sum to 1.0 */
  promptRelevance: number;
  semanticMatch: number;
  visualFit: number;
  colorSuitability: number;
  fileQuality: number;
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  promptRelevance: 0.4,
  semanticMatch: 0.25,
  visualFit: 0.2,
  colorSuitability: 0.1,
  fileQuality: 0.05,
};

export interface ScoreBreakdown {
  promptRelevance: number;
  semanticMatch: number;
  visualFit: number;
  colorSuitability: number;
  fileQuality: number;
  total: number;
}

// ── Ranked References ─────────────────────────────────────────────────────────

export interface RankedReference {
  file: ReferenceFile;
  features: ReferenceFeatures;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  /** Evidence-based human-readable reasons (2–4 strings) */
  reasons: string[];
  /** Signals that materially contributed to the match explanation. */
  matchBasis?: Array<"semantic" | "visual" | "metadata">;
  /** Confidence in the evidence basis, separate from the fit score. */
  matchConfidence?: number;
  isPinned: boolean;
  isRemoved: boolean;
  isTooSimilar: boolean;
}

// ── Style DNA ─────────────────────────────────────────────────────────────────

export interface StyleDNA {
  summary: string;
  colors: ColorSample[];
  composition: string[];
  lighting: string[];
  texture: string[];
  layout: string[];
  /** Traits shared by >60% of selected references */
  overrepresentedPatterns: string[];
  brightness: number;
  saturation: number;
  contrast: number;
  dominantOrientation: "portrait" | "landscape" | "square" | "mixed";
}

// ── Diversity ─────────────────────────────────────────────────────────────────

export type DiversityDimension =
  | "light-dark"
  | "warm-cool"
  | "dense-minimal"
  | "symmetrical-asymmetrical"
  | "portrait-landscape"
  | "photographic-illustrative"
  | "literal-abstract";

export interface DiversitySuggestion {
  reason: string;
  referenceIds: string[];
  dimension: DiversityDimension;
}

// ── Palette ───────────────────────────────────────────────────────────────────

export interface Palette {
  /** Human-readable label */
  name: string;
  colors: ColorSample[];
}

export interface PaletteSet {
  /** Dominant colors directly from selected references */
  extracted: Palette;
  /** Analogous ±30° hue shifts on the base */
  harmonized: Palette;
  /** Lightness-adjusted to meet WCAG AA 4.5:1 for text pairs */
  contrastAware: Palette;
}

// ── Accessibility ─────────────────────────────────────────────────────────────

export interface AccessibilityFinding {
  severity: "info" | "warning" | "error";
  message: string;
  affectedReferenceIds: string[];
  recommendation: string;
}

// ── Skipped Files ─────────────────────────────────────────────────────────────

export interface SkippedFile {
  path: string;
  reason:
    | "unsupported format"
    | "file too large"
    | "analysis failed"
    | "video excluded"
    | "access denied";
  details?: string;
}

// ── Full Analysis Result ──────────────────────────────────────────────────────

export interface AnalysisResult {
  sessionId: string;
  brief: string;
  creativeDirection: CreativeDirection;
  /** Full sorted list — top-12 cutoff applied by the UI */
  references: RankedReference[];
  styleDNA: StyleDNA;
  diversitySuggestions: DiversitySuggestion[];
  palette: PaletteSet;
  accessibilityFindings: AccessibilityFinding[];
  skippedFiles: SkippedFile[];
  aiAnalysis?: AiAnalysisSummary;
  scoringWeights: ScoringWeights;
  analyzedAt: number;
}

export interface AiAnalysisSummary {
  enabled: boolean;
  provider?: "gemini" | "openai" | "anthropic" | "groq" | "ollama";
  requested: number;
  visionCompleted: number;
  textFallback: number;
  failed: number;
  skipped: number;
  errors: string[];
}

// ── Board State (Zustand / localStorage) ─────────────────────────────────────

export interface BoardState {
  sessionId: string;
  brief: string;
  constraints: CreativeConstraint[];
  scoringWeights: ScoringWeights;
  result: AnalysisResult | null;
  pinnedIds: string[];
  removedIds: string[];
  tooSimilarIds: string[];
}

// ── Export ────────────────────────────────────────────────────────────────────

export interface ExportManifest {
  sessionId: string;
  brief: string;
  exportedAt: number;
  selectedReferenceIds: string[];
  /** "extracted" | "harmonized" | "contrastAware" */
  paletteSetId: keyof PaletteSet;
  version: string;
}

// ── Progress Events (streaming API) ──────────────────────────────────────────

export type ProgressEventType =
  | "scan-complete"
  | "file-analysis-progress"
  | "file-skipped"
  | "ranking-complete"
  | "style-dna-complete"
  | "diversity-complete"
  | "palette-complete"
  | "accessibility-complete"
  | "done"
  | "error";

export interface ProgressEvent {
  type: ProgressEventType;
  /** 0–100 */
  progress: number;
  message: string;
  /** Ranked references available before the final analysis completes. */
  partialReferences?: RankedReference[];
  /** Present only when type === "done" */
  result?: AnalysisResult;
  /** Present only when type === "error" */
  error?: string;
}

// ── Analyzer Interface ────────────────────────────────────────────────────────

export interface ReferenceAnalyzer {
  canAnalyze(file: ReferenceFile): boolean;
  analyze(
    file: ReferenceFile,
    buffer: Buffer
  ): Promise<Partial<ReferenceFeatures>>;
}
