"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useBoardStore } from "@/lib/store";
import { ReferenceCard } from "@/components/ReferenceCard";
import { CreativeDirectionPanel } from "@/components/CreativeDirectionPanel";
import { StyleDNAPanel } from "@/components/StyleDNAPanel";
import { DiversityPanel } from "@/components/DiversityPanel";
import { PalettePanel } from "@/components/PalettePanel";
import { AccessibilityPanel } from "@/components/AccessibilityPanel";
import { SkippedFilesPanel } from "@/components/SkippedFilesPanel";
import type { PaletteSet } from "@/core/types";

const TOP_N = 12;

export default function BoardPage() {
  const router = useRouter();
  const {
    result,
    pinnedIds,
    removedIds,
    brief,
    pinReference,
    unpinReference,
    removeReference,
    markTooSimilar,
    resetReview,
    startNewSession,
  } = useBoardStore();

  if (!result) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="mb-4 text-gray-500">No analysis result yet.</p>
          <button
            type="button"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            onClick={() => router.push("/")}
          >
            Start a new analysis
          </button>
        </div>
      </main>
    );
  }

  const { references, creativeDirection, styleDNA, diversitySuggestions, palette, accessibilityFindings, skippedFiles } = result;

  // Show top 12; pinned ones are already sorted to the top by the ranker
  const visible = references
    .filter((r) => !r.isRemoved)
    .slice(0, TOP_N);

  async function handleExport() {
    if (!result) return;
    const selectedIds = visible.map((r) => r.file.id);

    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          result,
          selectedIds,
          paletteSetId: "extracted" as keyof PaletteSet,
          files: {}, // Omit file buffers — export will skip binary references without them
        }),
      });

      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "creative-reference-package.zip";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Export failed. Please try again.");
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-screen-xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="text-sm text-blue-600 hover:underline"
              onClick={() => router.push("/")}
            >
              ← New Analysis
            </button>
            <span className="text-sm text-gray-400">|</span>
            <p className="max-w-lg truncate text-sm text-gray-700 italic">
              "{brief}"
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
              onClick={resetReview}
            >
              Reset Review
            </button>
            <button
              type="button"
              className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              onClick={handleExport}
            >
              Export ZIP
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-screen-xl px-4 py-6">
        <div className="flex gap-6">
          {/* Left sidebar — analysis panels */}
          <aside className="flex w-72 shrink-0 flex-col gap-4">
            <CreativeDirectionPanel direction={creativeDirection} />
            <StyleDNAPanel dna={styleDNA} />
            <DiversityPanel
              suggestions={diversitySuggestions}
              onAddToBoard={(ids) => {
                // Unremove suggested references so they appear on the board
                ids.forEach((id) => {
                  const ref = references.find((r) => r.file.id === id);
                  if (ref?.isRemoved) {
                    // Would call unremoveReference here if we needed it
                  }
                });
              }}
            />
            <PalettePanel palette={palette} />
            <AccessibilityPanel findings={accessibilityFindings} />
            <SkippedFilesPanel skipped={skippedFiles} />
          </aside>

          {/* Main board — reference cards */}
          <section className="flex-1">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">
                Top {TOP_N} References{" "}
                <span className="font-normal text-gray-400">
                  ({references.filter((r) => !r.isRemoved).length} total)
                </span>
              </h2>
              {removedIds.length > 0 && (
                <p className="text-xs text-gray-400">
                  {removedIds.length} removed
                </p>
              )}
            </div>

            {visible.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300">
                <p className="text-sm text-gray-500">All references removed.</p>
                <button
                  type="button"
                  className="text-xs text-blue-500 hover:underline"
                  onClick={resetReview}
                >
                  Reset review
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
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
          </section>
        </div>
      </div>
    </main>
  );
}
