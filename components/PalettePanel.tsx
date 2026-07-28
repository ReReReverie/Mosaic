"use client";

import React, { useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PaletteSet, Palette } from "@/core/types";

interface Props { palette: PaletteSet; }

function PaletteRow({ palette }: { palette: Palette }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="t-label">{palette.name}</span>
      <div className="flex gap-2">
        {palette.colors.map((c, index) => {
          const hasFail = c.contrastWarnings.some((w) => w.failsAA);
          return (
            <Tooltip key={`${palette.name}-${c.hex}-${index}`}>
              <TooltipTrigger>
                <div className="flex flex-col items-center gap-1 cursor-default">
                  <span
                    className="block h-8 w-8 rounded-lg relative"
                    style={{
                      background: c.hex,
                      border: hasFail
                        ? "2px solid var(--error-color)"
                        : "1.5px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    {hasFail && (
                      <span
                        className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full text-white"
                        style={{ background: "var(--error-color)", fontSize: "0.55rem" }}
                      >
                        !
                      </span>
                    )}
                  </span>
                  <span
                    className="text-center font-semibold uppercase"
                    style={{ color: "var(--text-3)", fontSize: "0.55rem", letterSpacing: "0.06em" }}
                  >
                    {c.role.slice(0, 2)}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <div className="text-xs">
                  <p className="font-semibold">{c.hex}</p>
                  <p style={{ color: "var(--text-2)" }}>{c.role}</p>
                  {hasFail && (
                    <p style={{ color: "var(--error-color)" }}>Fails WCAG AA contrast</p>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

export function PalettePanel({ palette }: Props) {
  const [open, setOpen] = useState(true);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--surface-3)", border: "1px solid var(--border-1)" }}
    >
      <button type="button" className="panel-toggle" onClick={() => setOpen((o) => !o)}>
        <span className="t-title">Palettes</span>
        <span className="t-caption">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div
          className="flex flex-col gap-4 px-4 pb-4 pt-3"
          style={{ borderTop: "1px solid var(--border-1)" }}
        >
          <PaletteRow palette={palette.extracted} />
          <div style={{ height: 1, background: "var(--border-1)" }} />
          <PaletteRow palette={palette.harmonized} />
          <div style={{ height: 1, background: "var(--border-1)" }} />
          <PaletteRow palette={palette.contrastAware} />
        </div>
      )}
    </div>
  );
}
