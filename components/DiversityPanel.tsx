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
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--surface-3)",
        border: "1px solid rgba(245,166,35,0.20)",
      }}
    >
      <button type="button" className="panel-toggle" onClick={() => setOpen((o) => !o)}>
        <span className="t-title" style={{ color: "var(--warn-color)" }}>
          Diversity  ({suggestions.length})
        </span>
        <span className="t-caption">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div
          className="flex flex-col gap-2 px-3 pb-3 pt-2"
          style={{ borderTop: "1px solid rgba(245,166,35,0.15)" }}
        >
          {suggestions.map((s, i) => (
            <div
              key={i}
              className="flex items-start justify-between gap-2 rounded-lg p-2.5"
              style={{
                background: "var(--surface-4)",
                border: "1px solid var(--border-1)",
              }}
            >
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>
                {s.reason}
              </p>
              <button
                type="button"
                className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold transition-all"
                style={{
                  background: "rgba(245,166,35,0.12)",
                  color: "var(--warn-color)",
                  border: "1px solid rgba(245,166,35,0.2)",
                }}
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
