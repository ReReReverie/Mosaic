"use client";

import React, { useState } from "react";
import type { SkippedFile } from "@/core/types";

interface Props { skipped: SkippedFile[]; }

export function SkippedFilesPanel({ skipped }: Props) {
  const [open, setOpen] = useState(false);

  if (skipped.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <button
        type="button"
        className="flex w-full items-center justify-between p-3 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-sm font-semibold text-gray-500">
          Skipped Files ({skipped.length})
        </span>
        <span className="text-gray-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-1 border-t border-gray-100 p-3">
          {skipped.map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-gray-500">
              <span className="shrink-0 font-medium text-gray-700">{f.reason}</span>
              <span className="line-clamp-1 text-gray-400">{f.path}</span>
              {f.details && <span className="italic">{f.details}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
