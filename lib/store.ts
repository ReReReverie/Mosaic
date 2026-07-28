"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AnalysisResult,
  BoardState,
  CreativeConstraint,
  ScoringWeights,
} from "@/core/types";
import { DEFAULT_SCORING_WEIGHTS } from "@/core/types";

// ─────────────────────────────────────────────────────────────────────────────
// Board Store
// Single source of truth for the posterboard session.
// Persisted to localStorage keyed by sessionId.
// ─────────────────────────────────────────────────────────────────────────────

export interface UploadedFile {
  id: string;
  file: File;
}

interface BoardActions {
  setBrief: (brief: string) => void;
  setConstraints: (constraints: CreativeConstraint[]) => void;
  setScoringWeights: (weights: ScoringWeights) => void;
  setResult: (result: AnalysisResult) => void;
  clearResult: () => void;
  setUploadedFiles: (files: UploadedFile[]) => void;
  pinReference: (id: string) => void;
  unpinReference: (id: string) => void;
  removeReference: (id: string) => void;
  unremoveReference: (id: string) => void;
  markTooSimilar: (id: string) => void;
  unmarkTooSimilar: (id: string) => void;
  resetReview: () => void;
  startNewSession: () => void;
}

type Store = BoardState & { uploadedFiles: UploadedFile[] } & BoardActions;

function generateSessionId(): string {
  if (typeof window !== "undefined" && window.crypto) {
    return window.crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

export const useBoardStore = create<Store>()(
  persist(
    (set, get) => ({
      // ── Initial state ──────────────────────────────────────────────────────
      sessionId: generateSessionId(),
      brief: "",
      constraints: [],
      scoringWeights: DEFAULT_SCORING_WEIGHTS,
      result: null,
      pinnedIds: [],
      removedIds: [],
      tooSimilarIds: [],
      uploadedFiles: [],

      // ── Actions ────────────────────────────────────────────────────────────

      setBrief: (brief) => set({ brief }),

      setConstraints: (constraints) => set({ constraints }),

      setScoringWeights: (scoringWeights) => set({ scoringWeights }),

      /**
       * Merge new result with existing pin/remove/tooSimilar state.
       * References that were pinned, removed, or marked as similar retain their
       * state even after a rerun.
       */
      setResult: (result) => {
        const { pinnedIds, removedIds, tooSimilarIds } = get();

        // Re-apply review state to the new result
        const mergedReferences = result.references.map((ref) => ({
          ...ref,
          isPinned: pinnedIds.includes(ref.file.id),
          isRemoved: removedIds.includes(ref.file.id),
          isTooSimilar: tooSimilarIds.includes(ref.file.id),
        }));

        set({
          sessionId: result.sessionId,
          result: { ...result, references: mergedReferences },
        });
      },

      clearResult: () => set({ result: null, uploadedFiles: [] }),

      setUploadedFiles: (uploadedFiles) => set({ uploadedFiles }),

      pinReference: (id) => {
        const { pinnedIds, result } = get();
        if (pinnedIds.includes(id)) return;
        const newPinned = [...pinnedIds, id];
        set({
          pinnedIds: newPinned,
          result: result
            ? {
                ...result,
                references: result.references.map((r) =>
                  r.file.id === id ? { ...r, isPinned: true } : r
                ),
              }
            : null,
        });
      },

      unpinReference: (id) => {
        const { pinnedIds, result } = get();
        set({
          pinnedIds: pinnedIds.filter((p) => p !== id),
          result: result
            ? {
                ...result,
                references: result.references.map((r) =>
                  r.file.id === id ? { ...r, isPinned: false } : r
                ),
              }
            : null,
        });
      },

      removeReference: (id) => {
        const { removedIds, result } = get();
        if (removedIds.includes(id)) return;
        const newRemoved = [...removedIds, id];
        set({
          removedIds: newRemoved,
          result: result
            ? {
                ...result,
                references: result.references.map((r) =>
                  r.file.id === id ? { ...r, isRemoved: true } : r
                ),
              }
            : null,
        });
      },

      unremoveReference: (id) => {
        const { removedIds, result } = get();
        set({
          removedIds: removedIds.filter((r) => r !== id),
          result: result
            ? {
                ...result,
                references: result.references.map((r) =>
                  r.file.id === id ? { ...r, isRemoved: false } : r
                ),
              }
            : null,
        });
      },

      markTooSimilar: (id) => {
        const { tooSimilarIds, result } = get();
        if (tooSimilarIds.includes(id)) return;
        set({
          tooSimilarIds: [...tooSimilarIds, id],
          result: result
            ? {
                ...result,
                references: result.references.map((r) =>
                  r.file.id === id ? { ...r, isTooSimilar: true } : r
                ),
              }
            : null,
        });
      },

      unmarkTooSimilar: (id) => {
        const { tooSimilarIds, result } = get();
        set({
          tooSimilarIds: tooSimilarIds.filter((t) => t !== id),
          result: result
            ? {
                ...result,
                references: result.references.map((r) =>
                  r.file.id === id ? { ...r, isTooSimilar: false } : r
                ),
              }
            : null,
        });
      },

      /** Clear all pin/remove/tooSimilar state but keep the result. */
      resetReview: () => {
        const { result } = get();
        set({
          pinnedIds: [],
          removedIds: [],
          tooSimilarIds: [],
          result: result
            ? {
                ...result,
                references: result.references.map((r) => ({
                  ...r,
                  isPinned: false,
                  isRemoved: false,
                  isTooSimilar: false,
                })),
              }
            : null,
        });
      },

      /** Start a completely fresh session. */
      startNewSession: () => {
        set({
          sessionId: generateSessionId(),
          brief: "",
          constraints: [],
          scoringWeights: DEFAULT_SCORING_WEIGHTS,
          result: null,
          pinnedIds: [],
          removedIds: [],
          tooSimilarIds: [],
          uploadedFiles: [],
        });
      },
    }),
    {
      name: "creative-reference-board",
      // Only persist these fields — file buffers live in component state
      partialize: (state) => ({
        sessionId: state.sessionId,
        brief: state.brief,
        constraints: state.constraints,
        scoringWeights: state.scoringWeights,
        pinnedIds: state.pinnedIds,
        removedIds: state.removedIds,
        tooSimilarIds: state.tooSimilarIds,
        // Note: result is NOT persisted — it's re-fetched on load if needed
      }),
    }
  )
);
