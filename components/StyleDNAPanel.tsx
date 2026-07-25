"use client";

import React, { useState } from "react";
import type { StyleDNA } from "@/core/types";

interface Props { dna: StyleDNA; }

function Metric({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between">
        <span className="t-caption">{label}</span>
        <span className="t-caption" style={{ color: "var(--text-2)" }}>{pct}%</span>
      </div>
      <div className="h-1 w-full rounded-full overflow-hidden" style={{ background: "var(--surface-4)" }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: "var(--lime)" }}
        />
      </div>
    </div>
  );
}

export function StyleDNAPanel({ dna }: Props) {
  const [open, setOpen] = useState(true);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--surface-3)", border: "1px solid var(--border-1)" }}
    >
      <button type="button" className="panel-toggle" onClick={() => setOpen((o) => !o)}>
        <span className="t-title">Style DNA</span>
        <span className="t-caption">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div
          className="flex flex-col gap-4 px-4 pb-4 pt-3"
          style={{ borderTop: "1px solid var(--border-1)" }}
        >
          {/* Summary */}
          <p className="text-xs italic leading-relaxed" style={{ color: "var(--text-2)" }}>
            "{dna.summary}"
          </p>

          {/* Colors */}
          {dna.colors.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="t-label">Dominant Colors</span>
              <div className="flex gap-2">
                {dna.colors.map((c) => (
                  <div key={c.hex} className="flex flex-col items-center gap-1">
                    <span
                      className="block h-7 w-7 rounded-lg"
                      style={{
                        background: c.hex,
                        border: "1.5px solid rgba(255,255,255,0.08)",
                      }}
                      title={c.hex}
                    />
                    <span className="text-xs" style={{ color: "var(--text-3)", fontSize: "0.6rem" }}>
                      {c.hex}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metrics */}
          <div className="flex flex-col gap-2.5">
            <span className="t-label">Visual Profile</span>
            <Metric label="Brightness"  value={dna.brightness} />
            <Metric label="Saturation"  value={dna.saturation} />
            <Metric label="Contrast"    value={dna.contrast} />
          </div>

          {/* Overrepresented */}
          {dna.overrepresentedPatterns.length > 0 && (
            <div
              className="rounded-lg px-3 py-2.5 text-xs"
              style={{
                background: "rgba(245,166,35,0.07)",
                border: "1px solid rgba(245,166,35,0.18)",
                color: "var(--warn-color)",
              }}
            >
              <span className="font-semibold block mb-0.5">Overrepresented</span>
              {dna.overrepresentedPatterns.join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
