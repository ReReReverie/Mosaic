"use client";

// Previews can be local blob URLs or runtime-selected provider URLs, so they cannot be statically allowlisted for next/image.
/* eslint-disable @next/next/no-img-element */

import React from "react";
import type { AnalysisResult, ProgressEvent, RankedReference } from "@/core/types";
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
  reasons: string[];
  analysis: MosaicAnalysis;
  isPinned: boolean;
  isRemoved: boolean;
  isTooSimilar: boolean;
}

const DEFAULT_BRIEF = "Find references for a warm, editorial poster about local food for young adults.";
const ACCEPTED_FILE_TYPES = ".png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff,.svg,.pdf,.txt,.md,.csv,.json,.doc,.docx";

function inferDirection(brief: string) {
  const text = brief.toLowerCase();
  const find = (values: string[], fallback: string) => values.find((value) => text.includes(value)) ?? fallback;
  return {
    subject: find(["local food", "food", "market", "product", "people", "nature", "architecture"], "visual subject"),
    mood: find(["warm", "calm", "playful", "bold", "serious", "energetic", "welcoming"], "considered"),
    style: find(["editorial", "minimal", "retro", "experimental", "handmade", "modern", "documentary"], "visual"),
    audience: find(["young adults", "students", "families", "designers", "community"], "defined audience"),
  };
}

async function deriveClientFileId(file: File): Promise<string> {
  const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
  const raw = `${relativePath}::${file.size}::${file.lastModified}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function toMosaicReference(reference: RankedReference): MosaicReference {
  const { file, features } = reference;
  const isBright = features.brightness >= 0.6;
  const isIllustrative = features.isIllustrative;
  const extractedSubject = features.extractedText[0] || "primary visual subject";
  return {
    id: file.id,
    source: "local",
    title: file.filename,
    previewUrl: file.mimeType.startsWith("image/") ? `/api/thumbnail/${encodeURIComponent(file.id)}` : "",
    provider: "Attached library",
    score: Math.round(reference.score * 100),
    reasons: reference.reasons,
    isPinned: reference.isPinned,
    isRemoved: reference.isRemoved,
    isTooSimilar: reference.isTooSimilar,
    analysis: {
      angle: `${features.orientation} composition`,
      placement: `Subject ${features.subjectPlacement}`,
      crop: `${features.orientation} crop`,
      lighting: isBright ? "Bright, open light" : "Low-key tonal range",
      perspective: isIllustrative ? "Illustrative language" : "Photographic depth",
      focal: extractedSubject,
      negativeSpace: features.contrast < 0.35 ? "Quiet and generous" : "Active and layered",
      texture: isIllustrative ? "Graphic marks and shape" : "Natural image texture",
      tags: [features.orientation, isIllustrative ? "illustrative" : "photographic", ...features.extractedText.slice(0, 2)],
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

async function readAnalysisStream(response: Response, onProgress: (progress: number, message: string) => void): Promise<AnalysisResult> {
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
    onProgress(event.progress, event.message);
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
  const imageVisible = Boolean(reference.previewUrl) && !imageFailed;
  return (
    <article className="mosaic-reference-card">
      <div className="mosaic-reference-image">
        {imageVisible ? <img src={reference.previewUrl} alt={reference.title} loading="lazy" onError={() => setImageFailed(true)} /> : <div className="mosaic-file-placeholder" aria-label={`${reference.title} preview unavailable`}><span>{reference.source === "online" ? "◎" : "＋"}</span><small>{reference.title.split(".").pop()?.toUpperCase() || "FILE"}</small></div>}
        <div className="mosaic-source-label"><span className={reference.source === "online" ? "online" : "local"}>{reference.source.toUpperCase()}</span>{reference.source === "online" && reference.license && <span className="license">{reference.license}</span>}</div>
        <div className="mosaic-score-badge">{reference.score}<small>% FIT</small></div>
      </div>
      <div className="mosaic-reference-body">
        <div className="mosaic-reference-topline"><div><p className="mosaic-reference-kicker">{reference.provider || "ATTACHED LIBRARY"}</p><h3 title={reference.title}>{reference.title}</h3></div><button type="button" className={`mosaic-pin-button ${reference.isPinned ? "pinned" : ""}`} onClick={onPin} aria-label={reference.isPinned ? "Unpin reference" : "Pin reference"}>{reference.isPinned ? "●" : "○"}</button></div>
        <p className="mosaic-analysis-summary"><strong>{reference.analysis.angle}</strong> · {reference.analysis.placement.toLowerCase()} · {reference.analysis.lighting.toLowerCase()}</p>
        <div className="mosaic-card-tags">{reference.analysis.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div>
        <div className="mosaic-reason-list">{reference.reasons.slice(0, 2).map((reason) => <span key={reason}>+ {reason}</span>)}</div>
        <div className="mosaic-reference-actions"><button type="button" onClick={onExpand}>{expanded ? "Hide analysis" : "View analysis"} <span>↘</span></button>{reference.sourceUrl && <a href={reference.sourceUrl} target="_blank" rel="noreferrer">Open source ↗</a>}<button type="button" className="remove-action" onClick={onRemove}>Remove</button></div>
        <div className="mosaic-card-controls"><button type="button" onClick={onPin}>{reference.isPinned ? "Unpin" : "Pin"}</button><button type="button" onClick={onSimilar}>{reference.isTooSimilar ? "Similar" : "Flag similar"}</button></div>
        {expanded && <div className="mosaic-analysis-drawer"><div className="mosaic-analysis-heading"><span>OBSERVABLE SIGNALS</span><small>Derived from preview and metadata</small></div><div className="mosaic-analysis-grid">{[["Angle", reference.analysis.angle], ["Placement", reference.analysis.placement], ["Crop", reference.analysis.crop], ["Perspective", reference.analysis.perspective], ["Focal point", reference.analysis.focal], ["Negative space", reference.analysis.negativeSpace], ["Lighting", reference.analysis.lighting], ["Texture", reference.analysis.texture]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><div className="mosaic-detail-row"><span>DOMINANT COLORS</span><div className="mosaic-tiny-swatches">{reference.analysis.colors.map((color) => <i key={color} title={color} style={{ background: color }} />)}</div></div>{reference.source === "online" && <div className="mosaic-attribution"><span>ATTRIBUTION</span><strong>{reference.creator || "Creator not supplied"} · {reference.license || "License unavailable"}</strong></div>}</div>}
      </div>
    </article>
  );
}

function InsightBar({ label, value }: { label: string; value: number }) {
  return <div className="mosaic-dna-bar"><div><span>{label}</span><strong>{value}%</strong></div><span className="mosaic-bar-track"><i style={{ width: `${value}%` }} /></span></div>;
}

export default function HomePage() {
  const { brief: storedBrief, result, constraints, scoringWeights, pinnedIds, removedIds, uploadedFiles, setBrief, setConstraints, setResult, setUploadedFiles, startNewSession, pinReference, unpinReference, removeReference, markTooSimilar } = useBoardStore();
  const [briefInput, setBriefInput] = React.useState(storedBrief || DEFAULT_BRIEF);
  const [files, setFiles] = React.useState<File[]>([]);
  const [onlineReferences, setOnlineReferences] = React.useState<MosaicReference[]>([]);
  const [onlinePinned, setOnlinePinned] = React.useState<string[]>([]);
  const [onlineRemoved, setOnlineRemoved] = React.useState<string[]>([]);
  const [onlineSimilar, setOnlineSimilar] = React.useState<string[]>([]);
  const [autoSearch, setAutoSearch] = React.useState(false);
  const [tab, setTab] = React.useState<"all" | Source>("all");
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<RunStatus>("idle");
  const [progress, setProgress] = React.useState(0);
  const [progressMessage, setProgressMessage] = React.useState("");
  const [notice, setNotice] = React.useState("");

  const direction = React.useMemo(() => inferDirection(briefInput), [briefInput]);
  const localReferences = React.useMemo(() => result?.references.map(toMosaicReference) ?? [], [result]);
  const onlineWithState = React.useMemo(() => onlineReferences.map((reference) => ({ ...reference, isPinned: onlinePinned.includes(reference.id), isRemoved: onlineRemoved.includes(reference.id), isTooSimilar: onlineSimilar.includes(reference.id) })), [onlineReferences, onlinePinned, onlineRemoved, onlineSimilar]);
  const allReferences = [...localReferences, ...onlineWithState];
  const visibleReferences = allReferences.filter((reference) => !reference.isRemoved);
  const filteredReferences = visibleReferences.filter((reference) => tab === "all" || reference.source === tab);
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
    setFiles([...unique.values()]);
  }

  function updateConstraint(type: "format" | "output", value: string) {
    const next = constraints.filter((constraint) => constraint.type !== type);
    if (value !== "any" && value !== "both") next.push({ type, value, description: `${type === "format" ? "Format" : "Output"}: ${value}` });
    setConstraints(next);
  }

  async function fetchOnlineReferences() {
    const response = await fetch("/api/discover", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ brief: briefInput, direction }) });
    if (!response.ok) throw new Error("Automatic search is unavailable right now.");
    return parseOnlineReferences(await response.json());
  }

  async function handleAnalyze() {
    if (!canAnalyze) return;
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
        const response = await fetch("/api/analyze", { method: "POST", body: formData });
        const analysis = await readAnalysisStream(response, (nextProgress, message) => { setProgress(nextProgress); setProgressMessage(message); });
        const filesById = new Map(clientFileIds.map((id, index) => [id, files[index]]));
        setUploadedFiles(analysis.references.flatMap((reference) => { const file = filesById.get(reference.file.id); return file ? [{ id: reference.file.id, file }] : []; }));
        setResult(analysis);
      } else {
        setUploadedFiles([]);
        setProgress(100);
        setProgressMessage("Online references ready");
      }
      setOnlineReferences(discovered);
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
    setTab("all");
    setExpandedId(null);
    setStatus("idle");
    setProgress(0);
    setProgressMessage("");
    setNotice("");
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
          <form className="mosaic-panel mosaic-brief-panel" onSubmit={(event) => { event.preventDefault(); void handleAnalyze(); }}>
            <div className="mosaic-panel-heading"><div><p className="mosaic-eyebrow">START WITH A BRIEF</p><h2>Set the direction</h2></div><span className="mosaic-step-number">01</span></div>
            <label className="mosaic-field-label" htmlFor="brief">What are you making?</label>
            <textarea id="brief" value={briefInput} onChange={(event) => { setBriefInput(event.target.value); setBrief(event.target.value); }} />
            <div className="mosaic-chips"><span className="mosaic-chip mosaic-chip-warm">{direction.mood}</span><span className="mosaic-chip">{direction.style}</span><span className="mosaic-chip">{direction.subject}</span><span className="mosaic-chip">poster</span></div>
            <div className="mosaic-divider" />
            <div className="mosaic-input-heading"><div><p className="mosaic-field-label">REFERENCE SOURCES</p><p className="mosaic-helper">Bring your own library, discover online, or both.</p></div><button type="button" className={`mosaic-toggle ${autoSearch ? "on" : ""}`} onClick={() => setAutoSearch((current) => !current)} aria-pressed={autoSearch}><span />{autoSearch ? "AUTO ON" : "AUTO OFF"}</button></div>
            <label className="mosaic-folder-drop" htmlFor="reference-folder"><input id="reference-folder" type="file" multiple accept={ACCEPTED_FILE_TYPES} onChange={(event) => handleFiles(event.target.files)} {...({ webkitdirectory: "" } as Record<string, string>)} /><span className="mosaic-folder-icon">＋</span><strong>{files.length ? `${files.length} files attached` : "Attach a reference folder"}</strong><small>{files.length ? "Ready for local analysis" : "PNG, JPG, PDF, SVG, TXT and more"}</small></label>
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
          <div className="mosaic-board-header"><div><p className="mosaic-eyebrow">REFERENCE BOARD {status === "ready" ? "· UPDATED JUST NOW" : "· AWAITING INPUT"}</p><h2>{status === "ready" ? `${visibleReferences.length} signals for your direction` : "A considered starting point"}</h2></div><div className="mosaic-board-actions"><button type="button" className="mosaic-ghost-button" onClick={handleReset}>RESET</button><button type="button" className="mosaic-export-button" disabled={!visibleReferences.length} onClick={handleExport}>EXPORT BOARD ↗</button></div></div>
          <div className="mosaic-board-toolbar"><div className="mosaic-tabs"><button type="button" className={tab === "all" ? "active" : ""} onClick={() => setTab("all")} aria-pressed={tab === "all"}>ALL <small>{visibleReferences.length}</small></button><button type="button" className={tab === "local" ? "active" : ""} onClick={() => setTab("local")} aria-pressed={tab === "local"}>LOCAL <small>{visibleReferences.filter((reference) => reference.source === "local").length}</small></button><button type="button" className={tab === "online" ? "active" : ""} onClick={() => setTab("online")} aria-pressed={tab === "online"}>ONLINE <small>{visibleReferences.filter((reference) => reference.source === "online").length}</small></button></div><span className="mosaic-board-sort">RANKED BY FIT <span>↓</span></span></div>
          {status === "idle" && <div className="mosaic-empty-board"><div className="mosaic-empty-glyph">M</div><h3>Your board starts here.</h3><p>Write a brief, attach a folder, or toggle Automatic Search. Mosaic will return references with the reasoning attached.</p><div className="mosaic-empty-lines"><span /><span /><span /></div></div>}
          {status === "scanning" && <div className="mosaic-loading-board"><span className="mosaic-loader" /><p>Reading visual signals and checking source metadata…</p><div className="mosaic-progress-track"><span style={{ width: `${progress}%` }} /></div></div>}
          {status === "ready" && filteredReferences.length === 0 && <div className="mosaic-empty-board"><div className="mosaic-empty-glyph">↺</div><h3>No references in this view.</h3><p>Try another source tab or reset the board to start over.</p></div>}
           {status === "ready" && filteredReferences.length > 0 && (
             <div className="mosaic-reference-grid">
               {filteredReferences.slice(0, 12).map((reference) => (
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
           )}
          {status === "ready" && <div className="mosaic-board-footer"><span><i className="mosaic-legend-local" /> Local analysis stays on your device</span><span><i className="mosaic-legend-online" /> Online references retain attribution</span></div>}
        </section>

        <aside className="mosaic-insights-column">
          <div className="mosaic-insight-card"><div className="mosaic-insight-title"><span className="mosaic-index">02</span><div><p className="mosaic-eyebrow">BRIEF SIGNALS</p><h3>Creative direction</h3></div></div><div className="mosaic-direction-grid">{[["SUBJECT", result?.creativeDirection.subject[0] || direction.subject], ["MOOD", result?.creativeDirection.mood[0] || direction.mood], ["STYLE", result?.creativeDirection.style[0] || direction.style], ["AUDIENCE", result?.creativeDirection.audience[0] || direction.audience]].map(([label, value]) => <div className="mosaic-insight-pill" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><p className="mosaic-insight-copy">{briefInput.length > 20 ? "The brief is specific enough to rank. Mosaic keeps the reasoning attached to every selection." : "Add more detail to make the ranking more specific."}</p></div>
          <div className="mosaic-insight-card"><div className="mosaic-insight-title"><span className="mosaic-index">03</span><div><p className="mosaic-eyebrow">PATTERN READ</p><h3>Style DNA</h3></div></div><p className="mosaic-style-summary">{result?.styleDNA.summary || (selectedReferences.length ? "The board is beginning to reveal shared visual characteristics." : "Select references to reveal the visual patterns the board is converging on.")}</p>{styleBars.map((bar) => <InsightBar key={bar.label} {...bar} />)}</div>
          <div className="mosaic-insight-card mosaic-palette-card"><div className="mosaic-insight-title"><span className="mosaic-index">04</span><div><p className="mosaic-eyebrow">COLOR STUDY</p><h3>Palette directions</h3></div></div><div className="mosaic-palette-list">{palettes.map((palette) => <div className="mosaic-palette-row" key={palette.name}><div className="mosaic-palette-label"><strong>{palette.name}</strong><span>{palette.name === "Contrast-aware" ? "CHECK CONTRAST" : "READY TO EXPLORE"}</span></div><div className="mosaic-swatches">{palette.colors.map((color) => <span key={color} title={color} style={{ background: color }} />)}</div></div>)}</div></div>
          <div className="mosaic-insight-card"><div className="mosaic-insight-title"><span className="mosaic-index">05</span><div><p className="mosaic-eyebrow">BOARD CHECK</p><h3>Useful tension</h3></div></div><p className="mosaic-style-summary">{selectedReferences.length < 3 ? "Add at least three references to compare visual clusters." : "The board has useful variation across angle and color. Keep one contrasting reference as a deliberate edge."}</p><div className="mosaic-check-row"><span>◌</span><div><strong>Accessibility scan</strong><small>{result ? (errorCount ? `${errorCount} contrast or compatibility issue${errorCount === 1 ? "" : "s"} need review.` : "No high-severity accessibility findings.") : "Runs when references are selected."}</small></div></div></div>
        </aside>
      </section>
      <footer className="mosaic-footer-note"><span>MOSAIC / CREATIVE REFERENCE LAB</span><span>ANALYTICAL AI · HUMAN JUDGMENT · SOURCE-AWARE</span></footer>
    </main>
  );
}
