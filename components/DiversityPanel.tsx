"use client";

import React, { useState } from "react";
import type { DiversitySuggestion } from "@/core/types";

interface Props {
  suggestions: DiversitySuggestion[];
  onAddToBoard: (ids: string[]) => void;
}

export function DiversityPanel({ suggestions, onAddToBoard }: Props) {
  const [open, setOpen] = useState(true);

  if (suggestions.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50">
      <button
        type="button"
        className="flex w-full items-center justify-between p-3 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-sm font-semibold text-amber-800">
          Diversity Suggestions ({suggestions.length})
        </span>
        <span className="text-amber-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t border-amber-100 p-3">
          {suggestions.map((s, i) => (
            <div key={i} className="flex items-start justify-between gap-2 rounded bg-white p-2 shadow-sm">
              <p className="text-xs text-gray-700">{s.reason}</p>
              <button
                type="button"
                className="shrink-0 rounded bg-amber-500 px-2 py-1 text-xs font-medium text-white hover:bg-amber-600"
                onClick={() => onAddToBoard(s.referenceIds)}
              >
                Show
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
