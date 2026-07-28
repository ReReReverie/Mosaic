"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useBoardStore } from "@/lib/store";
import { ReferenceCard } from "@/components/ReferenceCard";
import { CreativeDirectionPanel } from "@/components/CreativeDirectionPanel";
import { StyleDNAPanel } from "@/components/StyleDNAPanel";
import { DiversityPanel } from "@/components/DiversityPanel";
import { PalettePanel } from "@/components/PalettePanel";
import { AccessibilityPanel } from "@/components/AccessibilityPanel";
import { SkippedFilesPanel } from "@/components/SkippedFilesPanel";
import { PromptAnalysisPanel } from "@/components/PromptAnalysisPanel";
import { ReferenceSynthesisPanel } from "@/components/ReferenceSynthesisPanel";

const TOP_N = 12;

export default function BoardPage() {
  const router = useRouter();
  const {
    result, brief, pinnedIds, removedIds,
    pinReference, unpinReference, removeReference, markTooSimilar, resetReview,
  } = useBoardStore();

  if (!result) {
    return (
      <main
        className="flex min-h-screen flex-col items-center justify-center gap-6"
        style={{ background: "var(--surface-1)" }}
      >
        <div className="text-center">
          <p className="t-headline mb-2">No analysis yet</p>
          <p className="t-body mb-6">
            Start from a brief and a reference folder.
          </p>
          <Button
            onClick={() => router.push("/")}
            style={{ background: "var(--lime)", color: "#0c0c0f" }}
          >
            ← Back to Start
          </Button>
        </div>
      </main>
    );
  }

  const {
    references, creativeDirection, styleDNA,
    promptAnalysis, referenceSynthesis, diversitySuggestions, palette, accessibilityFindings, skippedFiles,
  } = result;

  const visible = references.filter((r) => !r.isRemoved).slice(0, TOP_N);
  const errorCount = accessibilityFindings.filter((f) => f.severity === "error").length;

  return (
    <div
      className="flex h-screen flex-col overflow-hidden"
      style={{ background: "var(--surface-1)" }}
    >
      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <header
        className="z-20 flex shrink-0 items-center gap-4 px-5 py-3"
        style={{
          borderBottom: "1px solid var(--border-1)",
          background: "rgba(12,12,15,0.90)",
          backdropFilter: "blur(20px)",
        }}
      >
        {/* Logo + brand */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="flex items-center gap-1.5 transition-opacity hover:opacity-70"
          >
            <span className="text-sm font-bold" style={{ color: "var(--lime)" }}>
              CRA
            </span>
          </button>
          <span style={{ color: "var(--border-1)" }}>/</span>
          <span className="t-caption max-w-xs truncate italic" style={{ color: "var(--text-3)" }}>
            &quot;{brief}&quot;
          </span>
        </div>

        <div className="flex-1" />

        {/* Stats row */}
        <div className="flex items-center gap-3">
          <span className="t-caption" style={{ color: "var(--text-3)" }}>
            {visible.length}/{references.length} shown
          </span>
          {pinnedIds.length > 0 && (
            <Badge
              className="text-xs"
              style={{
                background: "rgba(200,245,66,0.1)",
                color: "var(--lime)",
                border: "1px solid rgba(200,245,66,0.2)",
              }}
            >
              {pinnedIds.length} pinned
            </Badge>
          )}
          {errorCount > 0 && (
            <Badge
              className="text-xs"
              style={{
                background: "rgba(245,66,66,0.1)",
                color: "var(--error-color)",
                border: "1px solid rgba(245,66,66,0.2)",
              }}
            >
              {errorCount} a11y error{errorCount !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger>
              <Button
                size="sm"
                variant="outline"
                onClick={resetReview}
                className="text-xs"
                style={{
                  background: "transparent",
                  border: "1px solid var(--border-1)",
                  color: "var(--text-2)",
                }}
              >
                Reset
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Clear all pins and removals</TooltipContent>
          </Tooltip>

        </div>
      </header>

      {/* ── Body: sidebar + board ─────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left sidebar ───────────────────────────────────────────────── */}
        <ScrollArea
          className="shrink-0 overflow-y-auto"
          style={{
            width: 280,
            borderRight: "1px solid var(--border-1)",
            background: "var(--surface-2)",
          }}
        >
          <div className="flex flex-col gap-1 p-3">
            <PromptAnalysisPanel analysis={promptAnalysis} />
            <CreativeDirectionPanel direction={creativeDirection} />
            <ReferenceSynthesisPanel synthesis={referenceSynthesis} />
            <StyleDNAPanel dna={styleDNA} />
            <DiversityPanel
              suggestions={diversitySuggestions}
              onAddToBoard={(ids) => ids.forEach(pinReference)}
            />
            <PalettePanel palette={palette} />
            <AccessibilityPanel findings={accessibilityFindings} />
            <SkippedFilesPanel skipped={skippedFiles} />
          </div>
        </ScrollArea>

        {/* ── Main board ─────────────────────────────────────────────────── */}
        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="p-6">
            {/* Board header row */}
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h1 className="t-headline">Reference Board</h1>
                <p className="t-caption mt-0.5">
                  Top {TOP_N} results · {removedIds.length > 0 && `${removedIds.length} removed · `}
                  sorted by relevance
                </p>
              </div>
              <button
                type="button"
                onClick={() => router.push("/")}
                className="t-caption transition-all"
                style={{ color: "var(--text-3)" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "var(--lime)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "var(--text-3)")}
              >
                ← New analysis
              </button>
            </div>

            <Separator style={{ background: "var(--border-1)", marginBottom: 20 }} />

            {visible.length === 0 ? (
              /* Empty state */
              <div
                className="flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed py-24"
                style={{ borderColor: "var(--border-1)" }}
              >
                <span className="text-3xl" style={{ color: "var(--text-3)" }}>◻</span>
                <p className="t-body">All references removed.</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={resetReview}
                  style={{
                    border: "1px solid var(--border-1)",
                    color: "var(--text-2)",
                    background: "transparent",
                  }}
                >
                  Reset review
                </Button>
              </div>
            ) : (
              <div className="grid gap-4" style={{
                gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
              }}>
                {visible.map((ref) => (
                  <ReferenceCard
                    key={ref.file.id}
                    reference={ref}
                    onPin={pinReference}
                    onUnpin={unpinReference}
                    onRemove={removeReference}
                    onMarkSimilar={markTooSimilar}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
