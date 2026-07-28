"use client";

// Previews can be local blob URLs or runtime-selected provider URLs, so they cannot be statically allowlisted for next/image.
/* eslint-disable @next/next/no-img-element */

import React from "react";
import type { AiAnalysisSummary, AnalysisResult, ProgressEvent, RankedReference } from "@/core/types";
import type { AiProvider } from "@/core/aiProvider";
import { useBoardStore } from "@/lib/store";

type Source = "local" | "online";
type RunStatus = "idle" | "scanning" | "ready";

interface MosaicAnalysis {
  angle: string;
  placement: string;
  crop: string;
  lighting: string;
  perspective: string;
  focal: string;
  negativeSpace: string;
  texture: string;
  tags: string[];
  colors: string[];
  aiRationale?: string;
  aiEvidence?: string[];
}

interface MosaicReference {
  id: string;
  source: Source;
  title: string;
  previewUrl: string;
  sourceUrl?: string;
  provider?: string;
  creator?: string;
  license?: string;
  score: number;
  matchBasis?: Array<"semantic" | "visual" | "metadata">;
  matchConfidence?: number;
  analysisSource?: "deterministic" | "vision" | "ai-text" | "mixed";
  aiEnabled?: boolean;
  reasons: string[];
  analysis: MosaicAnalysis;
  isPinned: boolean;
  isRemoved: boolean;
  isTooSimilar: boolean;
}

const DEFAULT_BRIEF = "Find references for a warm, editorial poster about local food for young adults.";
const MAX_REFERENCE_FILES = 50;
const ACCEPTED_FILE_TYPES = ".png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff,.svg,.pdf,.txt,.md,.csv,.json,.doc,.docx";

function inferDirection(brief: string) {
  const text = brief.toLowerCase();
  const find = (values: string[], fallback: string) => values.find((value) => text.includes(value)) ?? fallback;
  return {
    subject: find(["local food", "food", "market", "product", "people", "nature", "architecture"], "visual subject"),
    mood: find(["awe inspiring", "awe-inspiring", "inspiring", "epic", "majestic", "warm", "calm", "playful", "bold", "serious", "energetic", "welcoming"], "considered"),
    style: find(["cinematic", "editorial", "minimal", "retro", "experimental", "handmade", "modern", "documentary"], "visual"),
    audience: find(["young adults", "students", "families", "designers", "community"], "defined audience"),
  };
}

async function deriveClientFileId(file: File): Promise<string> {
  const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
  const raw = `${relativePath}::${file.size}::${file.lastModified}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function toMosaicReference(reference: RankedReference, aiEnabled = false): MosaicReference {
  const { file, features } = reference;
  const isBright = features.brightness >= 0.6;
  const isIllustrative = features.isIllustrative;
  const extractedSubject = features.extractedText[0] || "primary visual subject";
  const semanticTags = features.semanticTags ?? [];

  const saturationLabel =
    features.saturation > 0.55 ? "vibrant" :
    features.saturation < 0.2  ? "desaturated" : "moderate saturation";

  const contrastLabel =
    features.contrast > 0.6 ? "high contrast" :
    features.contrast < 0.25 ? "soft / low contrast" : "balanced contrast";

  const cropLabel =
    features.aspectRatio > 1.4 ? "wide crop" :
    features.aspectRatio < 0.75 ? "tall crop" : "square-ish crop";

  return {
    id: file.id,
    source: "local",
    title: file.filename,
    previewUrl: file.mimeType.startsWith("image/") ? `/api/thumbnail/${encodeURIComponent(file.id)}` : "",
    provider: "Attached library",
    score: Math.round(reference.score * 100),
    matchBasis: reference.matchBasis,
    matchConfidence: reference.matchConfidence,
    analysisSource: features.analysisSource ?? "deterministic",
    aiEnabled,
    reasons: reference.reasons,
    isPinned: reference.isPinned,
    isRemoved: reference.isRemoved,
    isTooSimilar: reference.isTooSimilar,
    analysis: {
      angle: isBright ? "Open, ambient light" : "Directional or low-key light",
      placement: `Subject ${features.subjectPlacement}`,
      crop: cropLabel,
      lighting: isBright ? "High-key, bright exposure" : "Low-key tonal range",
      perspective: isIllustrative ? "Illustrative language" : "Photographic depth",
      focal: features.semanticDescription || extractedSubject,
      aiRationale: features.semanticRationale,
      aiEvidence: features.semanticEvidence,
      negativeSpace: features.contrast < 0.35 ? "Quiet and generous" : "Active and layered",
      texture: `${saturationLabel}, ${contrastLabel}`,
      tags: [...semanticTags.slice(0, 2), saturationLabel, isIllustrative ? "illustrative" : "photographic", ...features.extractedText.slice(0, 2)].filter((tag, index, tags) => tags.indexOf(tag) === index).slice(0, 5),
      colors: features.colors.map((color) => color.hex),
    },
  };
}

function parseOnlineReferences(value: unknown): MosaicReference[] {
  if (!value || typeof value !== "object") return [];
  const references = (value as { references?: unknown }).references;
  if (!Array.isArray(references)) return [];
  return references.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const reference = candidate as Partial<MosaicReference>;
    if (typeof reference.id !== "string" || typeof reference.title !== "string" || typeof reference.previewUrl !== "string" || typeof reference.score !== "number" || !Array.isArray(reference.reasons) || !reference.analysis || typeof reference.analysis !== "object") return [];
    return [{ ...(reference as MosaicReference), source: "online" as const, isPinned: false, isRemoved: false, isTooSimilar: false }];
  });
}

async function readAnalysisStream(
  response: Response,
  onProgress: (progress: number, message: string, partialReferences?: RankedReference[]) => void
): Promise<AnalysisResult> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Analysis failed with status ${response.status}.`);
  }
  if (!response.body) throw new Error("The analysis stream was unavailable.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed: AnalysisResult | null = null;
  const consume = (line: string) => {
    if (!line.trim()) return;
    let event: ProgressEvent;
    try { event = JSON.parse(line) as ProgressEvent; } catch { return; }
    onProgress(event.progress, event.message, event.partialReferences);
    if (event.type === "error") throw new Error(event.error ?? "Analysis failed.");
    if (event.type === "done" && event.result) completed = event.result;
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(consume);
    }
    consume(buffer);
  } finally {
    reader.releaseLock();
  }
  if (!completed) throw new Error("Analysis ended before completion.");
  return completed;
}

function escapeHtml(value: string): string {
  const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, (character) => entities[character]);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function posterboardHtml(brief: string, references: MosaicReference[]): string {
  const cards = references.map((reference) => `
    <article class="card">
      ${reference.previewUrl ? `<img src="${escapeHtml(reference.previewUrl)}" alt="${escapeHtml(reference.title)}">` : ""}
      <p class="kicker">${escapeHtml(reference.source.toUpperCase())} · ${reference.score}% FIT</p>
      <h2>${escapeHtml(reference.title)}</h2>
      <p>${escapeHtml(reference.reasons.slice(0, 2).join(" · "))}</p>
    </article>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Creative Reference Board</title><style>body{font-family:Arial,sans-serif;padding:32px;background:#f4f0e8;color:#1d2636}main{max-width:1100px;margin:auto}h1{font-size:38px;letter-spacing:-.05em}.brief{color:#69716e}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.card{background:#fbfaf6;border:1px solid #d9d4c8;border-radius:14px;padding:14px}.card img{width:100%;height:210px;object-fit:cover;border-radius:9px}.kicker{font-size:10px;letter-spacing:.1em;color:#ec7754;font-weight:700}h2{font-size:17px}</style></head><body><main><p class="kicker">MOSAIC / CREATIVE REFERENCE LAB</p><h1>Reference board</h1><p class="brief">${escapeHtml(brief)}</p><section class="grid">${cards}</section></main></body></html>`;
}

function MosaicReferenceCard({ reference, expanded, onPin, onRemove, onSimilar, onExpand }: {
  reference: MosaicReference;
  expanded: boolean;
  onPin: () => void;
  onRemove: () => void;
  onSimilar: () => void;
  onExpand: () => void;
}) {
  const [imageFailed, setImageFailed] = React.useState(false);
  const referenceCardRef = React.useRef<HTMLElement>(null);
  const imageVisible = Boolean(reference.previewUrl) && !imageFailed;

  React.useEffect(() => {
    if (!expanded) return;
    const drawer = referenceCardRef.current?.querySelector<HTMLElement>(".mosaic-analysis-drawer");
    if (drawer && typeof drawer.scrollIntoView === "function") {
      drawer.id = `analysis-${reference.id}`;
      drawer.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [expanded, reference.id]);

  return (
    <article ref={referenceCardRef} className="mosaic-reference-card">
      <div className="mosaic-reference-image">
        {imageVisible ? <img src={reference.previewUrl} alt={reference.title} loading="lazy" onError={() => setImageFailed(true)} /> : <div className="mosaic-file-placeholder" aria-label={`${reference.title} preview unavailable`}><span>{reference.source === "online" ? "◎" : "＋"}</span><small>{reference.title.split(".").pop()?.toUpperCase() || "FILE"}</small></div>}
        <div className="mosaic-source-label"><span className={reference.source === "online" ? "online" : "local"}>{reference.source.toUpperCase()}</span>{reference.source === "online" && reference.license && <span className="license">{reference.license}</span>}</div>
        <div className="mosaic-score-badge">{reference.score}<small>% FIT · {reference.analysisSource === "vision" ? "AI VISION" : reference.analysisSource === "ai-text" || reference.analysisSource === "mixed" ? "AI TEXT" : reference.aiEnabled ? "AI FALLBACK" : reference.matchBasis?.includes("semantic") ? "SEMANTIC" : reference.source === "online" ? "CURATED" : "VISUAL"}</small></div>
      </div>
      <div className="mosaic-reference-body">
        <div className="mosaic-reference-topline"><div><p className="mosaic-reference-kicker">{reference.provider || "ATTACHED LIBRARY"}</p><h3 title={reference.title}>{reference.title}</h3></div><button type="button" className={`mosaic-pin-button ${reference.isPinned ? "pinned" : ""}`} onClick={onPin} aria-label={reference.isPinned ? "Unpin reference" : "Pin reference"}>{reference.isPinned ? "●" : "○"}</button></div>
        <p className="mosaic-analysis-summary"><strong>{reference.analysis.angle}</strong> · {reference.analysis.placement.toLowerCase()} · {reference.analysis.lighting.toLowerCase()}</p>
        <div className="mosaic-card-tags">{reference.analysis.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div>
        <div className="mosaic-reason-list">{reference.reasons.slice(0, 2).map((reason) => <span key={reason}>+ {reason}</span>)}</div>
        <div className="mosaic-reference-actions"><button type="button" aria-expanded={expanded} aria-controls={`analysis-${reference.id}`} onClick={onExpand}>{expanded ? "Hide analysis" : "View analysis"} <span>↘</span></button>{reference.sourceUrl && <a href={reference.sourceUrl} target="_blank" rel="noreferrer">Open source ↗</a>}<button type="button" className="remove-action" onClick={onRemove}>Remove</button></div>
        <div className="mosaic-card-controls"><button type="button" onClick={onPin}>{reference.isPinned ? "Unpin" : "Pin"}</button><button type="button" onClick={onSimilar}>{reference.isTooSimilar ? "Similar" : "Flag similar"}</button></div>
        {expanded && <p className="mosaic-analysis-evidence">{reference.matchBasis?.join(" + ").toUpperCase() || "VISUAL"} EVIDENCE{reference.matchConfidence ? ` · ${Math.round(reference.matchConfidence * 100)}% CONFIDENCE` : ""}</p>}
        {expanded && <div className="mosaic-analysis-drawer"><div className="mosaic-analysis-heading"><span>{reference.analysisSource && reference.analysisSource !== "deterministic" ? "AI ANALYSIS" : "OBSERVABLE SIGNALS"}</span><small>{reference.analysisSource && reference.analysisSource !== "deterministic" ? "Reference-specific semantic read" : "Derived from preview and metadata"}</small></div>{reference.analysisSource && reference.analysisSource !== "deterministic" && <div className="mosaic-ai-read"><p><strong>What it sees:</strong> {reference.analysis.focal}</p>{reference.analysis.aiRationale && <p><strong>Why it fits:</strong> {reference.analysis.aiRationale}</p>}{reference.analysis.aiEvidence && reference.analysis.aiEvidence.length > 0 && <p><strong>Evidence:</strong> {reference.analysis.aiEvidence.join(" · ")}</p>}</div>}<div className="mosaic-analysis-grid">{[["Angle", reference.analysis.angle], ["Placement", reference.analysis.placement], ["Crop", reference.analysis.crop], ["Perspective", reference.analysis.perspective], ["Focal point", reference.analysis.focal], ["Negative space", reference.analysis.negativeSpace], ["Lighting", reference.analysis.lighting], ["Texture", reference.analysis.texture]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><div className="mosaic-detail-row"><span>DOMINANT COLORS</span><div className="mosaic-tiny-swatches">{reference.analysis.colors.map((color, index) => <i key={`${reference.id}-${color}-${index}`} title={color} style={{ background: color }} />)}</div></div>{reference.source === "online" && <div className="mosaic-attribution"><span>ATTRIBUTION</span><strong>{reference.creator || "Creator not supplied"} · {reference.license || "License unavailable"}</strong></div>}</div>}
      </div>
    </article>
  );
}

function InsightBar({ label, value }: { label: string; value: number }) {
  return <div className="mosaic-dna-bar"><div><span>{label}</span><strong>{value}%</strong></div><span className="mosaic-bar-track"><i style={{ width: `${value}%` }} /></span></div>;
}

const AI_PROVIDER_OPTIONS: Array<{ value: AiProvider; label: string }> = [
  { value: "gemini", label: "Google Gemini" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic Claude" },
  { value: "groq", label: "Groq" },
  { value: "ollama", label: "Ollama (local)" },
];

function AiProviderControls({
  provider,
  apiKey,
  open,
  onToggle,
  onProviderChange,
  onApiKeyChange,
  onClear,
  analysis,
}: {
  provider: AiProvider;
  apiKey: string;
  open: boolean;
  onToggle: () => void;
  onProviderChange: (provider: AiProvider) => void;
  onApiKeyChange: (apiKey: string) => void;
  onClear: () => void;
  analysis?: AiAnalysisSummary;
}) {
  const hasPersonalKey = apiKey.trim().length > 0;
  const completed = (analysis?.visionCompleted ?? 0) + (analysis?.textFallback ?? 0);
  return (
    <section className="mosaic-panel mosaic-ai-panel" aria-labelledby="ai-provider-heading">
      <div className="mosaic-panel-heading">
        <div>
          <p className="mosaic-eyebrow">AI PROVIDER</p>
          <h2 id="ai-provider-heading">Use your own engine</h2>
        </div>
        <span className={`mosaic-ai-state ${hasPersonalKey ? "session" : "default"}`}>
          {hasPersonalKey ? "SESSION" : "GEMINI DEFAULT"}
        </span>
      </div>
      <p className="mosaic-ai-helper">
        Gemini powers the hosted default. A personal key overrides it for this session only.
      </p>
      <button type="button" className="mosaic-ai-toggle" onClick={onToggle} aria-expanded={open}>
        {open ? "Hide provider settings" : "Use a personal API key"}
        <span>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="mosaic-ai-fields">
          <label className="mosaic-field-label" htmlFor="ai-provider">PROVIDER</label>
          <select
            id="ai-provider"
            value={provider}
            onChange={(event) => onProviderChange(event.target.value as AiProvider)}
          >
            {AI_PROVIDER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <label className="mosaic-field-label" htmlFor="personal-ai-key">PERSONAL API KEY</label>
          <input
            id="personal-ai-key"
            type="password"
            value={apiKey}
            onChange={(event) => onApiKeyChange(event.target.value)}
            autoComplete="new-password"
            spellCheck={false}
            placeholder="Paste your key"
            aria-describedby="personal-ai-key-help"
          />
          <div className="mosaic-ai-key-footer">
            <small id="personal-ai-key-help">Never stored in Neon, localStorage, or Vercel.</small>
            {hasPersonalKey && <button type="button" onClick={onClear}>Clear key</button>}
          </div>
        </div>
      )}
      {hasPersonalKey && <p className="mosaic-ai-active" role="status">Personal {AI_PROVIDER_OPTIONS.find((option) => option.value === provider)?.label} key active for this session.</p>}
      {analysis?.enabled && <p className={`mosaic-ai-status ${analysis.failed > 0 ? "warning" : "ready"}`} role="status">{analysis.provider?.toUpperCase()} AI: {completed}/{analysis.requested} references analyzed{analysis.failed > 0 ? ` · ${analysis.failed} fallback${analysis.failed === 1 ? "" : "s"}` : ""}</p>}
    </section>
  );
}

export default function HomePage() {
  const { brief: storedBrief, result, constraints, scoringWeights, pinnedIds, removedIds, tooSimilarIds, uploadedFiles, setBrief, setConstraints, setResult, clearResult, setUploadedFiles, startNewSession, pinReference, unpinReference, removeReference, markTooSimilar } = useBoardStore();
  const [briefInput, setBriefInput] = React.useState(storedBrief || DEFAULT_BRIEF);
  const [files, setFiles] = React.useState<File[]>([]);
  const [onlineReferences, setOnlineReferences] = React.useState<MosaicReference[]>([]);
  const [onlinePinned, setOnlinePinned] = React.useState<string[]>([]);
  const [onlineRemoved, setOnlineRemoved] = React.useState<string[]>([]);
  const [onlineSimilar, setOnlineSimilar] = React.useState<string[]>([]);
  const [autoSearch, setAutoSearch] = React.useState(false);
  const [tab, setTab] = React.useState<"all" | Source>("all");
  const [page, setPage] = React.useState(0);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<RunStatus>("idle");
  const [progress, setProgress] = React.useState(0);
  const [progressMessage, setProgressMessage] = React.useState("");
  const [streamingReferences, setStreamingReferences] = React.useState<RankedReference[]>([]);
  const [notice, setNotice] = React.useState("");
  const [aiProvider, setAiProvider] = React.useState<AiProvider>("gemini");
  const [personalApiKey, setPersonalApiKey] = React.useState("");
  const [aiSettingsOpen, setAiSettingsOpen] = React.useState(false);

  const PAGE_SIZE = 6;

  const direction = React.useMemo(() => inferDirection(briefInput), [briefInput]);
  const localReferences = React.useMemo(() => result?.references.map((reference) => toMosaicReference(reference, Boolean(result.aiAnalysis?.enabled))) ?? [], [result]);
  const streamingLocalReferences = React.useMemo(() => streamingReferences.map((reference) => toMosaicReference({
    ...reference,
    isPinned: pinnedIds.includes(reference.file.id),
    isRemoved: removedIds.includes(reference.file.id),
    isTooSimilar: tooSimilarIds.includes(reference.file.id),
  }, false)), [streamingReferences, pinnedIds, removedIds, tooSimilarIds]);
  const displayedLocalReferences = result ? localReferences : streamingLocalReferences;
  const onlineWithState = React.useMemo(() => onlineReferences.map((reference) => ({ ...reference, isPinned: onlinePinned.includes(reference.id), isRemoved: onlineRemoved.includes(reference.id), isTooSimilar: onlineSimilar.includes(reference.id) })), [onlineReferences, onlinePinned, onlineRemoved, onlineSimilar]);
  const allReferences = [...displayedLocalReferences, ...onlineWithState];
  const visibleReferences = allReferences.filter((reference) => !reference.isRemoved);
  const filteredReferences = visibleReferences.filter((reference) => tab === "all" || reference.source === tab);
  const totalPages = Math.max(1, Math.ceil(filteredReferences.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pagedReferences = filteredReferences.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const selectedReferences = visibleReferences.filter((reference) => reference.isPinned || reference.score >= 70).slice(0, 8);
  const errorCount = result?.accessibilityFindings.filter((finding) => finding.severity === "error").length ?? 0;
  const selectedFormat = String(constraints.find((constraint) => constraint.type === "format")?.value ?? "any");
  const selectedOutput = String(constraints.find((constraint) => constraint.type === "output")?.value ?? "both");
  const canAnalyze = briefInput.trim().length >= 5 && (files.length > 0 || autoSearch) && status !== "scanning";

  function handleFiles(list: FileList | null) {
    if (!list) return;
    const unique = new Map<string, File>();
    for (const file of Array.from(list)) {
      const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      unique.set(`${relativePath}:${file.size}:${file.lastModified}`, file);
    }
    const selected = [...unique.values()];
    if (selected.length > MAX_REFERENCE_FILES) {
      setNotice(`Please choose no more than ${MAX_REFERENCE_FILES} reference files. You selected ${selected.length}.`);
      return;
    }
    setFiles(selected);
  }

  function updateConstraint(type: "format" | "output", value: string) {
    const next = constraints.filter((constraint) => constraint.type !== type);
    if (value !== "any" && value !== "both") next.push({ type, value, description: `${type === "format" ? "Format" : "Output"}: ${value}` });
    setConstraints(next);
  }

  async function fetchOnlineReferences() {
    const response = await fetch("/api/discover", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ brief: briefInput, direction }) });
    if (!response.ok) throw new Error("Automatic search is unavailable right now.");
    const payload = await response.json() as { message?: unknown };
    const references = parseOnlineReferences(payload);
    if (references.length === 0 && typeof payload.message === "string") setNotice(payload.message);
    return references;
  }

  async function handleAnalyze() {
    if (!canAnalyze) return;
    clearResult();
    setOnlineReferences([]);
    setOnlinePinned([]);
    setOnlineRemoved([]);
    setOnlineSimilar([]);
    setUploadedFiles([]);
    setStreamingReferences([]);
    setStatus("scanning");
    setProgress(2);
    setProgressMessage("Preparing the reference library…");
    setNotice("");
    setBrief(briefInput.trim());
    try {
      let discovered: MosaicReference[] = [];
      if (autoSearch) {
        try { discovered = await fetchOnlineReferences(); } catch (error) {
          if (files.length === 0) throw error;
          setNotice("Automatic search is unavailable; continuing with your local library.");
        }
      }
      if (files.length > 0) {
        const clientFileIds = await Promise.all(files.map(deriveClientFileId));
        const formData = new FormData();
        formData.append("brief", briefInput.trim());
        formData.append("weights", JSON.stringify(scoringWeights));
        formData.append("constraints", JSON.stringify(constraints));
        formData.append("pinnedIds", JSON.stringify(pinnedIds));
        formData.append("removedIds", JSON.stringify(removedIds));
        formData.append("clientFileIds", JSON.stringify(clientFileIds));
        files.forEach((file) => formData.append("files", file, file.name));
        const filesById = new Map(clientFileIds.map((id, index) => [id, files[index]]));
        const personalKey = personalApiKey.trim();
        const response = await fetch("/api/analyze", {
          method: "POST",
          body: formData,
          headers: personalKey ? {
            "x-mosaic-ai-provider": aiProvider,
            "x-mosaic-ai-key": personalKey,
          } : undefined,
        });
        const analysis = await readAnalysisStream(response, (nextProgress, message, partialReferences) => {
          setProgress(nextProgress);
          setProgressMessage(message);
          if (partialReferences) setStreamingReferences(partialReferences);
        });
        setUploadedFiles(analysis.references.flatMap((reference) => { const file = filesById.get(reference.file.id); return file ? [{ id: reference.file.id, file }] : []; }));
        setResult(analysis);
        setStreamingReferences([]);
        if (analysis.aiAnalysis?.enabled && analysis.aiAnalysis.failed > 0) {
          const completed = analysis.aiAnalysis.visionCompleted + analysis.aiAnalysis.textFallback;
          const details = analysis.aiAnalysis.errors[0] ? ` ${analysis.aiAnalysis.errors[0]}` : "";
          setNotice(`${analysis.aiAnalysis.provider?.toUpperCase() ?? "AI"} analyzed ${completed}/${analysis.aiAnalysis.requested} references; ${analysis.aiAnalysis.failed} used deterministic fallback.${details}`);
        }
      } else {
        setUploadedFiles([]);
        setProgress(100);
        setProgressMessage("Online references ready");
      }
      setOnlineReferences(discovered);
      setPage(0);
      setStatus("ready");
      setProgress(100);
      setProgressMessage("Board ready");
    } catch (error) {
      setStatus("idle");
      setNotice(error instanceof Error ? error.message : "Analysis failed. Please try again.");
    }
  }

  function handleReset() {
    startNewSession();
    setBriefInput(DEFAULT_BRIEF);
    setFiles([]);
    setOnlineReferences([]);
    setOnlinePinned([]);
    setOnlineRemoved([]);
    setOnlineSimilar([]);
    setStreamingReferences([]);
    setTab("all");
    setPage(0);
    setExpandedId(null);
    setStatus("idle");
    setProgress(0);
    setProgressMessage("");
    setNotice("");
    setAiProvider("gemini");
    setPersonalApiKey("");
    setAiSettingsOpen(false);
  }

  function togglePin(reference: MosaicReference) {
    if (reference.source === "local") {
      if (reference.isPinned) unpinReference(reference.id);
      else pinReference(reference.id);
      return;
    }
    setOnlinePinned((current) => current.includes(reference.id) ? current.filter((id) => id !== reference.id) : [...current, reference.id]);
  }

  function removeReferenceFromBoard(reference: MosaicReference) {
    if (reference.source === "local") {
      removeReference(reference.id);
      return;
    }
    setOnlineRemoved((current) => [...current, reference.id]);
  }

  function toggleSimilar(reference: MosaicReference) {
    if (reference.source === "local") {
      markTooSimilar(reference.id);
      return;
    }
    setOnlineSimilar((current) => current.includes(reference.id) ? current.filter((id) => id !== reference.id) : [...current, reference.id]);
  }

  function handleExport() {
    const localToExport = localReferences.filter((reference) => !reference.isRemoved).slice(0, 12);
    if (result) {
      const selectedIds = localToExport.map((reference) => reference.id);
      const sourceFiles = uploadedFiles.filter((uploaded) => selectedIds.includes(uploaded.id));
      const formData = new FormData();
      formData.append("result", JSON.stringify(result));
      formData.append("selectedIds", JSON.stringify(selectedIds));
      formData.append("paletteSetId", "extracted");
      formData.append("fileIds", JSON.stringify(sourceFiles.map((uploaded) => uploaded.id)));
      sourceFiles.forEach((uploaded) => formData.append("files", uploaded.file, uploaded.file.name));
      void fetch("/api/export", { method: "POST", body: formData }).then(async (response) => {
        if (!response.ok) { const payload = (await response.json().catch(() => null)) as { error?: string } | null; throw new Error(payload?.error ?? "Export failed."); }
        downloadBlob(await response.blob(), "creative-reference-package.zip");
        setNotice("Exported the ZIP package with the board, palettes, and selected sources.");
      }).catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Export failed."));
      return;
    }
    const manifest = { brief: briefInput, references: visibleReferences, exportedAt: new Date().toISOString() };
    downloadBlob(new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }), "creative-reference-manifest.json");
    downloadBlob(new Blob([posterboardHtml(briefInput, visibleReferences)], { type: "text/html" }), "posterboard.html");
    setNotice("Exported the posterboard and analysis manifest.");
  }

  const palettes = result ? [
    { name: "Extracted base", colors: result.palette.extracted.colors.map((color) => color.hex) },
    { name: "Warm harmony", colors: result.palette.harmonized.colors.map((color) => color.hex) },
    { name: "Contrast-aware", colors: result.palette.contrastAware.colors.map((color) => color.hex) },
  ] : [
    { name: "Warm harmony", colors: ["#F5E4C3", "#D98A4E", "#A55D31", "#56705B", "#253044"] },
    { name: "Quiet editorial", colors: ["#F4F0E8", "#D9D4C8", "#7C827E", "#385C8D", "#1D2636"] },
    { name: "Contrast-aware", colors: ["#F7F4EC", "#D8E3D4", "#254B45", "#D66743", "#18212D"] },
  ];
  const styleBars = result ? [
    { label: "Saturation", value: Math.round(result.styleDNA.saturation * 100) },
    { label: "Contrast", value: Math.round(result.styleDNA.contrast * 100) },
    { label: "Quality", value: Math.round((result.references.reduce((sum, reference) => sum + reference.features.fileQualityScore, 0) / Math.max(1, result.references.length)) * 100) },
  ] : [
    { label: "Saturation", value: selectedReferences.length ? 62 : 0 },
    { label: "Contrast", value: selectedReferences.length ? 74 : 0 },
    { label: "Quality", value: selectedReferences.length ? 68 : 0 },
  ];

  return (
    <main className="mosaic-shell">
      <header className="mosaic-topbar"><div className="mosaic-brand-lockup"><span className="mosaic-brand-mark">M</span><div><strong>MOSAIC</strong><span>creative reference lab</span></div></div><div className="mosaic-topbar-meta"><span className="mosaic-status-dot" /> local-first analysis <span className="mosaic-slash">/</span> v1.0</div></header>
      <section className="mosaic-hero"><div><p className="mosaic-eyebrow">AI-ASSISTED VISUAL RESEARCH</p><h1>Find the visual language<br /><em>before</em> you make the thing.</h1><p className="mosaic-hero-subtitle">Mosaic turns a creative brief and a reference library into a ranked, explainable board—then shows you what the references have in common.</p></div><div className="mosaic-hero-note"><span>01</span><p>Analysis, not generation.<br /><strong>Your eye stays in charge.</strong></p></div></section>

      <section className="mosaic-workspace-grid">
        <aside className="mosaic-brief-column">
          <AiProviderControls
            provider={aiProvider}
            apiKey={personalApiKey}
            open={aiSettingsOpen}
            onToggle={() => setAiSettingsOpen((current) => !current)}
            onProviderChange={setAiProvider}
            onApiKeyChange={setPersonalApiKey}
            onClear={() => setPersonalApiKey("")}
            analysis={result?.aiAnalysis}
          />
          <form className="mosaic-panel mosaic-brief-panel" onSubmit={(event) => { event.preventDefault(); void handleAnalyze(); }}>
            <div className="mosaic-panel-heading"><div><p className="mosaic-eyebrow">START WITH A BRIEF</p><h2>Set the direction</h2></div><span className="mosaic-step-number">01</span></div>
            <label className="mosaic-field-label" htmlFor="brief">What are you making?</label>
            <textarea id="brief" value={briefInput} onChange={(event) => { setBriefInput(event.target.value); setBrief(event.target.value); }} />
            <div className="mosaic-chips"><span className="mosaic-chip mosaic-chip-warm">{direction.mood}</span><span className="mosaic-chip">{direction.style}</span><span className="mosaic-chip">{direction.subject}</span><span className="mosaic-chip">poster</span></div>
            <div className="mosaic-divider" />
            <div className="mosaic-input-heading"><div><p className="mosaic-field-label">REFERENCE SOURCES</p><p className="mosaic-helper">Bring your own library, discover online, or both.</p></div><button type="button" className={`mosaic-toggle ${autoSearch ? "on" : ""}`} onClick={() => setAutoSearch((current) => !current)} aria-pressed={autoSearch}><span />{autoSearch ? "AUTO ON" : "AUTO OFF"}</button></div>
            <label className="mosaic-folder-drop" htmlFor="reference-folder"><input id="reference-folder" type="file" multiple accept={ACCEPTED_FILE_TYPES} onChange={(event) => handleFiles(event.target.files)} {...({ webkitdirectory: "" } as Record<string, string>)} /><span className="mosaic-folder-icon">＋</span><strong>{files.length ? `${files.length} files attached` : "Attach a reference folder"}</strong><small>{files.length ? "Ready for local analysis" : "Up to 50 PNG, JPG, PDF, SVG, TXT and more"}</small></label>
            {autoSearch && <div className="mosaic-provider-row"><span className="mosaic-provider-badge">◎</span><div><strong>Open-license discovery</strong><small>Wikimedia Commons demo adapter · attribution retained</small></div><span className="mosaic-ready-label">READY</span></div>}
            <div className="mosaic-divider" />
            <div className="mosaic-field-row"><div><label className="mosaic-field-label" htmlFor="format">OUTPUT FORMAT</label><select id="format" value={selectedFormat} onChange={(event) => updateConstraint("format", event.target.value)}><option value="any">Any format</option><option value="poster">Poster</option><option value="editorial">Editorial</option><option value="social">Social</option><option value="branding">Branding</option></select></div><div><label className="mosaic-field-label" htmlFor="output">OUTPUT TYPE</label><select id="output" value={selectedOutput} onChange={(event) => updateConstraint("output", event.target.value)}><option value="both">Print + screen</option><option value="print">Print</option><option value="screen">Screen</option></select></div></div>
            <button className="mosaic-analyze-button" type="submit" disabled={!canAnalyze}><span>{status === "scanning" ? "ANALYZING LIBRARY" : status === "ready" ? "RERUN ANALYSIS" : "ANALYZE REFERENCES"}</span><b>↗</b></button>
            {status === "scanning" && <div className="mosaic-progress-message" role="status"><span style={{ width: `${progress}%` }} />{progressMessage || "Reading visual signals…"}</div>}
            {notice && <p className="mosaic-notice" role="status">{notice}</p>}
          </form>
          <div className="mosaic-mini-card"><span className="mosaic-mini-icon">✳</span><div><strong>Human in the loop</strong><p>Pin, remove, and rerun until the board feels like you.</p></div></div>
        </aside>

        <section className="mosaic-board-column">
          <div className="mosaic-board-header"><div><p className="mosaic-eyebrow">REFERENCE BOARD {status === "ready" ? "· UPDATED JUST NOW" : status === "scanning" ? "· ANALYZING" : "· AWAITING INPUT"}</p><h2>{status === "ready" ? `${visibleReferences.length} signals for your direction` : status === "scanning" && visibleReferences.length > 0 ? `${visibleReferences.length} signals ready — continuing analysis` : "A considered starting point"}</h2></div><div className="mosaic-board-actions"><button type="button" className="mosaic-ghost-button" onClick={handleReset}>RESET</button><button type="button" className="mosaic-export-button" disabled={!visibleReferences.length || status === "scanning"} onClick={handleExport}>EXPORT BOARD ↗</button></div></div>
          <div className="mosaic-board-toolbar"><div className="mosaic-tabs"><button type="button" className={tab === "all" ? "active" : ""} onClick={() => { setTab("all"); setPage(0); }} aria-pressed={tab === "all"}>ALL <small>{visibleReferences.length}</small></button><button type="button" className={tab === "local" ? "active" : ""} onClick={() => { setTab("local"); setPage(0); }} aria-pressed={tab === "local"}>LOCAL <small>{visibleReferences.filter((reference) => reference.source === "local").length}</small></button><button type="button" className={tab === "online" ? "active" : ""} onClick={() => { setTab("online"); setPage(0); }} aria-pressed={tab === "online"}>ONLINE <small>{visibleReferences.filter((reference) => reference.source === "online").length}</small></button></div><span className="mosaic-board-sort">RANKED BY FIT <span>↓</span></span></div>
          {result?.aiAnalysis?.enabled && <div className={`mosaic-ai-coverage ${result.aiAnalysis.failed > 0 ? "warning" : "ready"}`}><strong>{result.aiAnalysis.provider?.toUpperCase()} AI COVERAGE</strong><span>{result.aiAnalysis.visionCompleted + result.aiAnalysis.textFallback}/{result.aiAnalysis.requested} references analyzed · {result.aiAnalysis.visionCompleted} vision · {result.aiAnalysis.textFallback} text fallback · {result.aiAnalysis.failed} failed</span>{result.aiAnalysis.errors[0] && <small>{result.aiAnalysis.errors[0]}</small>}</div>}
          {status === "idle" && <div className="mosaic-empty-board"><div className="mosaic-empty-glyph">M</div><h3>Your board starts here.</h3><p>Write a brief, attach a folder, or toggle Automatic Search. Mosaic will return references with the reasoning attached.</p><div className="mosaic-empty-lines"><span /><span /><span /></div></div>}
          {status === "scanning" && <div className="mosaic-loading-board"><span className="mosaic-loader" /><p>{visibleReferences.length > 0 ? "More references are still being analyzed…" : "Reading visual signals and checking source metadata…"}</p><div className="mosaic-progress-track"><span style={{ width: `${progress}%` }} /></div></div>}
          {status === "ready" && filteredReferences.length === 0 && <div className="mosaic-empty-board"><div className="mosaic-empty-glyph">↺</div><h3>No references in this view.</h3><p>Try another source tab or reset the board to start over.</p></div>}
          {(status === "ready" || (status === "scanning" && filteredReferences.length > 0)) && (
            <>
              <div className="mosaic-reference-grid">
                {pagedReferences.map((reference) => (
                  <MosaicReferenceCard
                    key={reference.id}
                    reference={reference}
                    expanded={expandedId === reference.id}
                    onExpand={() => setExpandedId((current) => current === reference.id ? null : current)}
                    onPin={() => togglePin(reference)}
                    onRemove={() => removeReferenceFromBoard(reference)}
                    onSimilar={() => toggleSimilar(reference)}
                  />
                ))}
              </div>
              {totalPages > 1 && (
                <div className="mosaic-pagination">
                  <button
                    type="button"
                    className="mosaic-page-arrow"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={safePage === 0}
                    aria-label="Previous page"
                  >←</button>
                  <div className="mosaic-page-numbers">
                    {Array.from({ length: totalPages }, (_, i) => (
                      <button
                        key={i}
                        type="button"
                        className={`mosaic-page-number ${i === safePage ? "active" : ""}`}
                        onClick={() => setPage(i)}
                        aria-label={`Page ${i + 1}`}
                        aria-current={i === safePage ? "page" : undefined}
                      >{i + 1}</button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="mosaic-page-arrow"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={safePage === totalPages - 1}
                    aria-label="Next page"
                  >→</button>
                  <span className="mosaic-page-label">{safePage + 1} / {totalPages}</span>
                </div>
              )}
            </>
          )}
          {status === "ready" && <div className="mosaic-board-footer"><span><i className="mosaic-legend-local" /> Local analysis stays on your device</span><span><i className="mosaic-legend-online" /> Online references retain attribution</span></div>}
        </section>

        <aside className="mosaic-insights-column">
          <div className="mosaic-insight-card"><div className="mosaic-insight-title"><span className="mosaic-index">02</span><div><p className="mosaic-eyebrow">BRIEF SIGNALS</p><h3>Creative direction</h3></div></div><div className="mosaic-direction-grid">{[["SUBJECT", result?.creativeDirection.subject[0] || direction.subject], ["MOOD", result?.creativeDirection.mood.length ? `${result.creativeDirection.mood.slice(0, 6).join(" · ")}${result.creativeDirection.mood.length > 6 ? " · …" : ""}` : direction.mood], ["STYLE", result?.creativeDirection.style[0] || direction.style], ["AUDIENCE", result?.creativeDirection.audience[0] || direction.audience]].map(([label, value]) => <div className="mosaic-insight-pill" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><p className="mosaic-insight-copy">{briefInput.length > 20 ? "The brief is specific enough to rank. Mosaic keeps the reasoning attached to every selection." : "Add more detail to make the ranking more specific."}</p></div>
          <div className="mosaic-insight-card"><div className="mosaic-insight-title"><span className="mosaic-index">03</span><div><p className="mosaic-eyebrow">PATTERN READ</p><h3>Style DNA</h3></div></div><p className="mosaic-style-summary">{result?.styleDNA.summary || (selectedReferences.length ? "The board is beginning to reveal shared visual characteristics." : "Select references to reveal the visual patterns the board is converging on.")}</p>{styleBars.map((bar) => <InsightBar key={bar.label} {...bar} />)}</div>
          <div className="mosaic-insight-card mosaic-palette-card"><div className="mosaic-insight-title"><span className="mosaic-index">04</span><div><p className="mosaic-eyebrow">COLOR STUDY</p><h3>Palette directions</h3></div></div><div className="mosaic-palette-list">{palettes.map((palette) => <div className="mosaic-palette-row" key={palette.name}><div className="mosaic-palette-label"><strong>{palette.name}</strong><span>{palette.name === "Contrast-aware" ? "CHECK CONTRAST" : "READY TO EXPLORE"}</span></div><div className="mosaic-swatches">{palette.colors.map((color, index) => <span key={`${palette.name}-${color}-${index}`} title={color} style={{ background: color }} />)}</div></div>)}</div></div>
          <div className="mosaic-insight-card"><div className="mosaic-insight-title"><span className="mosaic-index">05</span><div><p className="mosaic-eyebrow">BOARD CHECK</p><h3>Useful tension</h3></div></div><p className="mosaic-style-summary">{selectedReferences.length < 3 ? "Add at least three references to compare visual clusters." : "The board has useful variation across angle and color. Keep one contrasting reference as a deliberate edge."}</p><div className="mosaic-check-row"><span>◌</span><div><strong>Accessibility scan</strong><small>{result ? (errorCount ? `${errorCount} contrast or compatibility issue${errorCount === 1 ? "" : "s"} need review.` : "No high-severity accessibility findings.") : "Runs when references are selected."}</small></div></div></div>
        </aside>
      </section>
      <footer className="mosaic-footer-note"><span>MOSAIC / CREATIVE REFERENCE LAB</span><span>ANALYTICAL AI · HUMAN JUDGMENT · SOURCE-AWARE</span></footer>
    </main>
  );
}
