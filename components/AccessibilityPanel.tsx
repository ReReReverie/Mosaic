"use client";

import React, { useState } from "react";
import type { AccessibilityFinding } from "@/core/types";

interface Props { findings: AccessibilityFinding[]; }

const SEVERITY_STYLES = {
  error: "bg-red-50 border-red-200 text-red-800",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
  info: "bg-blue-50 border-blue-200 text-blue-700",
};

const SEVERITY_ICON = { error: "✕", warning: "⚠", info: "ℹ" };

export function AccessibilityPanel({ findings }: Props) {
  const [open, setOpen] = useState(true);

  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <button
        type="button"
        className="flex w-full items-center justify-between p-3 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-sm font-semibold text-gray-800">
          Accessibility{" "}
          {errors > 0 && (
            <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
              {errors} error{errors !== 1 ? "s" : ""}
            </span>
          )}
          {warnings > 0 && (
            <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
              {warnings} warning{warnings !== 1 ? "s" : ""}
            </span>
          )}
        </span>
        <span className="text-gray-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t border-gray-100 p-3">
          {findings.length === 0 ? (
            <p className="text-xs text-gray-500">No accessibility issues found.</p>
          ) : (
            findings.map((f, i) => (
              <div
                key={i}
                className={`flex gap-2 rounded border p-2 text-xs ${SEVERITY_STYLES[f.severity]}`}
              >
                <span className="shrink-0 font-bold">{SEVERITY_ICON[f.severity]}</span>
                <div className="flex flex-col gap-1">
                  <p>{f.message}</p>
                  {f.recommendation && (
                    <p className="opacity-80">
                      <span className="font-semibold">Recommendation:</span> {f.recommendation}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
