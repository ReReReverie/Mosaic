"use client";

import React, { useState } from "react";
import type { SkippedFile } from "@/core/types";

interface Props { skipped: SkippedFile[]; }

export function SkippedFilesPanel({ skipped }: Props) {
  const [open, setOpen] = useState(false);
  if (skipped.length === 0) return null;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--surface-3)", border: "1px solid var(--border-1)" }}
    >
      <button type="button" className="panel-toggle" onClick={() => setOpen((o) => !o)}>
        <span className="t-title" style={{ color: "var(--text-2)" }}>
          Skipped ({skipped.length})
        </span>
        <span className="t-caption">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div
          className="flex flex-col gap-1.5 px-3 pb-3 pt-2"
          style={{ borderTop: "1px solid var(--border-1)" }}
        >
          {skipped.map((f, i) => (
            <div key={i} className="flex flex-col gap-0.5">
              <p className="text-xs truncate" style={{ color: "var(--text-2)" }}>
                {f.path.split(/[\\/]/).pop()}
              </p>
              <p className="text-xs" style={{ color: "var(--text-3)" }}>
                {f.reason}{f.details ? ` — ${f.details}` : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
