"use client";

import React, { useState } from "react";
import type { PaletteSet, Palette } from "@/core/types";

interface Props { palette: PaletteSet; }

function PaletteView({ palette }: { palette: Palette }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold text-gray-600">{palette.name}</span>
      <div className="flex gap-1.5">
        {palette.colors.map((c) => {
          const hasWarning = c.contrastWarnings.some((w) => w.failsAA);
          return (
            <div key={c.hex} className="flex flex-col items-center gap-0.5">
              <div
                className={`h-8 w-8 rounded border ${hasWarning ? "border-red-400" : "border-gray-200"}`}
                style={{ background: c.hex }}
                title={`${c.hex} — ${c.role}`}
              />
              <span className="text-xs text-gray-400">{c.role.slice(0, 2).toUpperCase()}</span>
              {hasWarning && (
                <span className="text-xs text-red-500" title="Fails WCAG AA contrast">⚠</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PalettePanel({ palette }: Props) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <button
        type="button"
        className="flex w-full items-center justify-between p-3 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-sm font-semibold text-gray-800">Palette Recommendations</span>
        <span className="text-gray-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-4 border-t border-gray-100 p-3">
          <PaletteView palette={palette.extracted} />
          <PaletteView palette={palette.harmonized} />
          <PaletteView palette={palette.contrastAware} />
        </div>
      )}
    </div>
  );
}
