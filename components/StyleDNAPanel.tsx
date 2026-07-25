"use client";

import React, { useState } from "react";
import type { StyleDNA } from "@/core/types";

interface Props { dna: StyleDNA; }

export function StyleDNAPanel({ dna }: Props) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <button
        type="button"
        className="flex w-full items-center justify-between p-3 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-sm font-semibold text-gray-800">Style DNA</span>
        <span className="text-gray-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-gray-100 p-3">
          <p className="text-sm text-gray-700 italic">"{dna.summary}"</p>

          {/* Dominant colors */}
          {dna.colors.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Dominant Colors
              </span>
              <div className="flex gap-1.5">
                {dna.colors.map((c) => (
                  <div key={c.hex} className="flex flex-col items-center gap-0.5">
                    <span
                      className="h-6 w-6 rounded border border-gray-200"
                      style={{ background: c.hex }}
                      title={c.hex}
                    />
                    <span className="text-xs text-gray-400">{c.hex}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metrics */}
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: "Brightness", value: dna.brightness },
              { label: "Saturation", value: dna.saturation },
              { label: "Contrast", value: dna.contrast },
            ].map(({ label, value }) => (
              <div key={label} className="rounded bg-gray-50 p-2">
                <div className="text-sm font-semibold text-gray-800">
                  {Math.round(value * 100)}%
                </div>
                <div className="text-xs text-gray-400">{label}</div>
              </div>
            ))}
          </div>

          {/* Overrepresented patterns */}
          {dna.overrepresentedPatterns.length > 0 && (
            <div className="rounded bg-yellow-50 p-2 text-xs text-yellow-800">
              <span className="font-semibold">Overrepresented: </span>
              {dna.overrepresentedPatterns.join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
