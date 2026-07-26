"use client";

import React, { useState } from "react";
import type { AccessibilityFinding } from "@/core/types";

interface Props { findings: AccessibilityFinding[]; }

const SEV_STYLE = {
  error:   { color: "var(--error-color)",  bg: "rgba(245,66,66,0.07)",   border: "rgba(245,66,66,0.18)",   icon: "✕" },
  warning: { color: "var(--warn-color)",   bg: "rgba(245,166,35,0.07)",  border: "rgba(245,166,35,0.18)",  icon: "⚠" },
  info:    { color: "var(--info-color)",   bg: "rgba(66,168,245,0.07)",  border: "rgba(66,168,245,0.18)",  icon: "ℹ" },
};

export function AccessibilityPanel({ findings }: Props) {
  const [open, setOpen] = useState(true);
  const errors   = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--surface-3)", border: "1px solid var(--border-1)" }}
    >
      <button type="button" className="panel-toggle" onClick={() => setOpen((o) => !o)}>
        <span className="t-title flex items-center gap-2">
          Accessibility
          {errors > 0 && (
            <span
              className="rounded-md px-1.5 py-0.5 text-xs font-semibold"
              style={{ background: "rgba(245,66,66,0.1)", color: "var(--error-color)" }}
            >
              {errors}
            </span>
          )}
          {warnings > 0 && (
            <span
              className="rounded-md px-1.5 py-0.5 text-xs font-semibold"
              style={{ background: "rgba(245,166,35,0.1)", color: "var(--warn-color)" }}
            >
              {warnings}
            </span>
          )}
        </span>
        <span className="t-caption">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div
          className="flex flex-col gap-2 px-3 pb-3 pt-2"
          style={{ borderTop: "1px solid var(--border-1)" }}
        >
          {findings.length === 0 ? (
            <p className="t-caption py-1">No issues found.</p>
          ) : (
            findings.map((f, i) => {
              const s = SEV_STYLE[f.severity];
              return (
                <div
                  key={i}
                  className="rounded-lg p-2.5 text-xs"
                  style={{
                    background: s.bg,
                    border: `1px solid ${s.border}`,
                    color: s.color,
                  }}
                >
                  <div className="flex items-start gap-1.5">
                    <span className="font-bold shrink-0">{s.icon}</span>
                    <p className="leading-relaxed">{f.message}</p>
                  </div>
                  {f.recommendation && (
                    <p
                      className="mt-1 ml-4 text-xs opacity-75"
                      style={{ color: "var(--text-2)" }}
                    >
                      {f.recommendation}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
