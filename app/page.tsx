"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useBoardStore } from "@/lib/store";
import type { ProgressEvent } from "@/core/types";

// ─── Feature cards data ───────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: "⬡",
    title: "Brief Interpretation",
    desc: "Natural language parsed into structured creative signals — mood, style, audience, and color direction.",
  },
  {
    icon: "◈",
    title: "Explainable Ranking",
    desc: "Every reference card shows evidence-based reasons. No black-box scores.",
  },
  {
    icon: "◉",
    title: "Style DNA",
    desc: "Shared visual characteristics of your top references — aggregated, not generated.",
  },
  {
    icon: "⊞",
    title: "Diversity Alerts",
    desc: "Detects repetitive boards and recommends alternatives from your own folder.",
  },
  {
    icon: "◐",
    title: "Palette Engine",
    desc: "Three palette variants derived from your references with WCAG contrast checks.",
  },
  {
    icon: "◻",
    title: "Accessibility Checker",
    desc: "Contrast ratios, color-blind risk, resolution and aspect-ratio compatibility.",
  },
];

const EXAMPLES = [
  "Warm, editorial poster about local food for young adults.",
  "Minimal, high-contrast branding for a tech startup.",
  "Dark, photographic campaign for a jazz music festival.",
];

// ─── Landing Page ─────────────────────────────────────────────────────────────
export default function HomePage() {
  const router = useRouter();
  const {
    brief,
    setBrief,
    setResult,
    setUploadedFiles,
    scoringWeights,
    constraints,
    setConstraints,
    pinnedIds,
    removedIds,
  } = useBoardStore();
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function handleFiles(list: FileList | null) {
    if (!list) return;
    const unique = new Map<string, File>();
    for (const file of Array.from(list)) {
      const relativePath =
        (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
        file.name;
      unique.set(`${relativePath}:${file.size}:${file.lastModified}`, file);
    }
    setFiles([...unique.values()]);
  }

  function updateConstraint(type: "format" | "output", value: string) {
    const next = constraints.filter((constraint) => constraint.type !== type);
    if (value !== "any" && value !== "both") {
      next.push({
        type,
        value,
        description: `${type === "format" ? "Format" : "Output"}: ${value}`,
      });
    }
    setConstraints(next);
  }

  async function handleAnalyze() {
    if (!brief.trim() || files.length === 0) return;
    setIsLoading(true);
    setError(null);
    setProgress(2);
    setProgressMsg("Preparing…");

    try {
      const fd = new FormData();
      fd.append("brief", brief.trim());
      fd.append("weights", JSON.stringify(scoringWeights));
      fd.append("constraints", JSON.stringify(constraints));
      fd.append("pinnedIds", JSON.stringify(pinnedIds));
      fd.append("removedIds", JSON.stringify(removedIds));
      files.forEach((f) => fd.append("files", f));

      const res = await fetch("/api/analyze", { method: "POST", body: fd });
      if (!res.ok) {
        const payload = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error ?? `Server error ${res.status}`);
      }
      if (!res.body) throw new Error("The analysis stream was unavailable.");

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";

      let completed = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let ev: ProgressEvent;
          try {
            ev = JSON.parse(line) as ProgressEvent;
          } catch {
            continue;
          }
          setProgress(ev.progress);
          setProgressMsg(ev.message);
          if (ev.type === "error") throw new Error(ev.error ?? "Analysis failed.");
          if (ev.type === "done" && ev.result) {
            const uploaded = files.flatMap((file) => {
              const match = ev.result?.references.find(
                (reference) =>
                  reference.file.filename === file.name &&
                  reference.file.sizeBytes === file.size &&
                  reference.file.lastModified === file.lastModified
              );
              return match ? [{ id: match.file.id, file }] : [];
            });
            setUploadedFiles(uploaded);
            setResult(ev.result);
            completed = true;
            router.push("/board");
            return;
          }
        }
      }
      if (!completed) throw new Error("Analysis ended before completion.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "An error occurred.");
    } finally {
      setIsLoading(false);
    }
  }

  const canSubmit = brief.trim().length >= 5 && files.length > 0 && !isLoading;
  const selectedFormat = String(
    constraints.find((constraint) => constraint.type === "format")?.value ?? "any"
  );
  const selectedOutput = String(
    constraints.find((constraint) => constraint.type === "output")?.value ?? "both"
  );

  return (
    <main className="min-h-screen" style={{ background: "var(--surface-1)" }}>
      {/* ── Nav ──────────────────────────────────────────────────────────────── */}
      <nav
        className="sticky top-0 z-50 flex items-center justify-between px-6 py-4"
        style={{
          borderBottom: "1px solid var(--border-1)",
          background: "rgba(12,12,15,0.85)",
          backdropFilter: "blur(20px)",
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-bold tracking-tight"
            style={{ color: "var(--lime)" }}
          >
            CRA
          </span>
          <span
            className="text-sm font-medium"
            style={{ color: "var(--text-1)" }}
          >
            Creative Reference Assistant
          </span>
        </div>
        <Badge
          variant="outline"
          className="text-xs"
          style={{
            color: "var(--text-3)",
            borderColor: "var(--border-1)",
            background: "transparent",
          }}
        >
          v1.0 · MVP
        </Badge>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden px-6 py-24 text-center dot-grid"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(200,245,66,0.06) 0%, transparent 70%)",
        }}
      >
        {/* Glow orb */}
        <div
          className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2"
          style={{
            width: 600,
            height: 300,
            borderRadius: "50%",
            background: "radial-gradient(ellipse, rgba(200,245,66,0.10) 0%, transparent 70%)",
            filter: "blur(40px)",
          }}
        />

        <div className="relative mx-auto max-w-3xl">
          <div className="fade-up mb-6 flex justify-center">
            <span
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold tracking-wider uppercase"
              style={{
                color: "var(--lime)",
                borderColor: "rgba(200,245,66,0.25)",
                background: "rgba(200,245,66,0.07)",
              }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--lime)" }}
              />
              July Challenge · Reimagine Creative Industries with AI
            </span>
          </div>

          <h1 className="t-display fade-up fade-up-1 mb-5">
            Brief to moodboard.
            <br />
            <span style={{ color: "var(--lime)" }} className="lime-glow-text">
              Faster.
            </span>
          </h1>

          <p
            className="t-body fade-up fade-up-2 mx-auto mb-10 max-w-xl text-base"
            style={{ color: "var(--text-2)" }}
          >
            Upload your reference folder, describe your brief, and get a ranked
            moodboard with explainable insights — Style DNA, diversity alerts,
            palette recommendations, and accessibility checks. No generated
            images, ever.
          </p>

          {/* ── Brief + upload card ─────────────────────────────────────────── */}
          <div
            className="fade-up fade-up-3 mx-auto w-full max-w-2xl rounded-2xl p-px"
            style={{
              background:
                "linear-gradient(135deg, rgba(200,245,66,0.15), rgba(255,255,255,0.04), transparent)",
            }}
          >
            <div
              className="rounded-2xl p-6"
              style={{ background: "var(--surface-2)" }}
            >
              {/* Brief textarea */}
              <div className="mb-4">
                <label
                  htmlFor="brief"
                  className="t-label mb-2 block"
                >
                  Creative Brief
                </label>
                <Textarea
                  id="brief"
                  rows={3}
                  placeholder="e.g. Warm, editorial poster about local food for young adults…"
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  maxLength={1000}
                  disabled={isLoading}
                  className="resize-none text-sm"
                  style={{
                    background: "var(--surface-3)",
                    border: "1px solid var(--border-1)",
                    color: "var(--text-1)",
                  }}
                />
                {/* Example pills */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {EXAMPLES.map((ex, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setBrief(ex)}
                      disabled={isLoading}
                      className="rounded-full border px-2.5 py-0.5 text-xs transition-all"
                      style={{
                        color: "var(--text-3)",
                        borderColor: "var(--border-1)",
                        background: "transparent",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.color = "var(--lime)";
                        (e.currentTarget as HTMLButtonElement).style.borderColor =
                          "rgba(200,245,66,0.3)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.color = "var(--text-3)";
                        (e.currentTarget as HTMLButtonElement).style.borderColor =
                          "var(--border-1)";
                      }}
                    >
                      {ex.split(",")[0]}…
                    </button>
                  ))}
                </div>
              </div>

              {/* Output constraints */}
              <div className="mb-5 grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="format" className="t-label mb-2 block">Target format</label>
                  <select
                    id="format"
                    value={selectedFormat}
                    onChange={(e) => updateConstraint("format", e.target.value)}
                    disabled={isLoading}
                    className="h-10 w-full rounded-lg px-3 text-sm"
                    style={{
                      background: "var(--surface-3)",
                      border: "1px solid var(--border-1)",
                      color: "var(--text-1)",
                    }}
                  >
                    <option value="any">Any format</option>
                    <option value="poster">Poster</option>
                    <option value="social">Social</option>
                    <option value="website">Website</option>
                    <option value="logo">Logo</option>
                    <option value="editorial">Editorial</option>
                    <option value="branding">Branding</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="output" className="t-label mb-2 block">Output</label>
                  <select
                    id="output"
                    value={selectedOutput}
                    onChange={(e) => updateConstraint("output", e.target.value)}
                    disabled={isLoading}
                    className="h-10 w-full rounded-lg px-3 text-sm"
                    style={{
                      background: "var(--surface-3)",
                      border: "1px solid var(--border-1)",
                      color: "var(--text-1)",
                    }}
                  >
                    <option value="both">Print + screen</option>
                    <option value="print">Print</option>
                    <option value="screen">Screen</option>
                  </select>
                </div>
              </div>

              {/* Folder upload */}
              <div className="mb-5">
                <label htmlFor="reference-files" className="t-label mb-2 block">Reference Folder</label>
                <div
                  className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-8 transition-all"
                  role="button"
                  tabIndex={isLoading ? -1 : 0}
                  aria-label="Choose a reference folder"
                  style={{
                    borderColor: isDragging
                      ? "var(--lime)"
                      : "var(--border-1)",
                    background: isDragging
                      ? "rgba(200,245,66,0.04)"
                      : "var(--surface-3)",
                  }}
                  onClick={() => inputRef.current?.click()}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === " ") && !isLoading) {
                      e.preventDefault();
                      inputRef.current?.click();
                    }
                  }}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    handleFiles(e.dataTransfer.files);
                  }}
                >
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={files.length > 0 ? "var(--lime)" : "var(--text-3)"}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 7a2 2 0 012-2h3l2 2h7a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                  </svg>
                  {files.length > 0 ? (
                    <p className="t-title" style={{ color: "var(--lime)" }}>
                      {files.length} file{files.length !== 1 ? "s" : ""} selected
                    </p>
                  ) : (
                    <p className="t-body">
                      Drop folder here or{" "}
                      <span style={{ color: "var(--lime)" }}>browse</span>
                    </p>
                  )}
                  <p className="t-caption">PNG, JPEG, SVG, PDF, text files · max 50 MB each</p>
                </div>
                <input
                  ref={inputRef}
                  id="reference-files"
                  type="file"
                  className="hidden"
                  // @ts-expect-error webkitdirectory not in standard types
                  webkitdirectory=""
                  multiple
                  accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/tiff,image/svg+xml,application/pdf,text/plain,text/markdown,text/html,text/csv,application/json"
                  onChange={(e) => handleFiles(e.target.files)}
                  disabled={isLoading}
                />
              </div>

              {/* Progress */}
              {isLoading && (
                <div className="mb-5 flex flex-col gap-2">
                  <div className="flex justify-between">
                    <span className="t-caption">{progressMsg}</span>
                    <span className="t-caption">{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-1" />
                </div>
              )}

              {/* Error */}
              {error && (
                <div
                  className="mb-4 rounded-lg px-4 py-3 text-sm"
                  style={{
                    background: "rgba(245,66,66,0.08)",
                    border: "1px solid rgba(245,66,66,0.2)",
                    color: "var(--error-color)",
                  }}
                >
                  {error}
                </div>
              )}

              <Button
                size="lg"
                className="w-full font-semibold"
                style={{
                  background: canSubmit ? "var(--lime)" : "var(--surface-4)",
                  color: canSubmit ? "#0c0c0f" : "var(--text-3)",
                  transition: "all 0.2s",
                }}
                disabled={!canSubmit}
                onClick={handleAnalyze}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Analysing references…
                  </span>
                ) : (
                  "Analyse References →"
                )}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature grid ─────────────────────────────────────────────────────── */}
      <section
        className="px-6 py-20"
        style={{ borderTop: "1px solid var(--border-1)" }}
      >
        <div className="mx-auto max-w-5xl">
          <p className="t-label mb-10 text-center">What it does</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <div
                key={i}
                className="rounded-xl p-5 transition-all"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-1)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderColor =
                    "rgba(200,245,66,0.2)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderColor =
                    "var(--border-1)";
                }}
              >
                <span
                  className="mb-3 block text-2xl"
                  style={{ color: "var(--lime)" }}
                >
                  {f.icon}
                </span>
                <p className="t-title mb-1">{f.title}</p>
                <p className="t-body text-xs">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer
        className="px-6 py-8 text-center"
        style={{ borderTop: "1px solid var(--border-1)" }}
      >
        <p className="t-caption">
          No images are generated. Your references stay on your machine.
          <span className="mx-2" style={{ color: "var(--border-1)" }}>·</span>
          Built with Next.js · shadcn/ui · Sharp · GPT-4o (optional)
        </p>
      </footer>
    </main>
  );
}
