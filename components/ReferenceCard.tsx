"use client";

import React from "react";
import Image from "next/image";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { RankedReference } from "@/core/types";

interface Props {
  reference: RankedReference;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
  onRemove: (id: string) => void;
  onMarkSimilar: (id: string) => void;
}

function matchBadge(score: number) {
  if (score >= 0.75) return { label: "Strong", style: { color: "var(--lime)", background: "rgba(200,245,66,0.10)", border: "1px solid rgba(200,245,66,0.20)" } };
  if (score >= 0.5)  return { label: "Good",   style: { color: "var(--info-color)", background: "rgba(66,168,245,0.10)", border: "1px solid rgba(66,168,245,0.20)" } };
  if (score >= 0.3)  return { label: "Partial", style: { color: "var(--warn-color)", background: "rgba(245,166,35,0.10)", border: "1px solid rgba(245,166,35,0.20)" } };
  return { label: "Weak", style: { color: "var(--text-3)", background: "var(--surface-4)", border: "1px solid var(--border-1)" } };
}

export function ReferenceCard({ reference, onPin, onUnpin, onRemove, onMarkSimilar }: Props) {
  const { file, features, score, reasons, isPinned, isTooSimilar } = reference;
  const { label, style: badgeStyle } = matchBadge(score);
  const isImage = file.mimeType.startsWith("image/");
  const pct = Math.round(score * 100);

  return (
    <div
      className="group flex flex-col overflow-hidden rounded-xl transition-all"
      style={{
        background: "var(--surface-3)",
        border: isPinned
          ? "1px solid rgba(200,245,66,0.35)"
          : "1px solid var(--border-1)",
        boxShadow: isPinned ? "0 0 0 1px rgba(200,245,66,0.12)" : "none",
        opacity: reference.isRemoved ? 0.3 : 1,
      }}
    >
      {/* ── Thumbnail ────────────────────────────────────────────────────── */}
      <div
        className="relative flex h-40 w-full items-center justify-center overflow-hidden"
        style={{ background: "var(--surface-4)" }}
      >
        {isImage ? (
          <Image
            src={`/api/thumbnail/${file.id}`}
            alt={file.filename}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, 210px"
          />
        ) : (
          <div className="flex flex-col items-center gap-1.5" style={{ color: "var(--text-3)" }}>
            <span className="text-3xl leading-none">
              {file.mimeType === "application/pdf" ? "⬜" : "◻"}
            </span>
            <span className="text-xs font-semibold uppercase tracking-widest">
              {file.mimeType.split("/").pop()}
            </span>
          </div>
        )}

        {/* Score pill overlay */}
        <div className="absolute bottom-2 left-2">
          <span
            className="rounded-md px-2 py-0.5 text-xs font-semibold"
            style={badgeStyle}
          >
            {label} · {pct}%
          </span>
        </div>

        {/* Pinned flag */}
        {isPinned && (
          <div
            className="absolute right-2 top-2 rounded-md px-1.5 py-0.5 text-xs font-bold"
            style={{
              background: "rgba(200,245,66,0.15)",
              color: "var(--lime)",
              border: "1px solid rgba(200,245,66,0.3)",
            }}
          >
            Pinned
          </div>
        )}
        {isTooSimilar && (
          <div
            className="absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-xs font-bold"
            style={{
              background: "rgba(245,166,35,0.12)",
              color: "var(--warn-color)",
              border: "1px solid rgba(245,166,35,0.25)",
            }}
          >
            Similar
          </div>
        )}
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-2.5 p-3">
        {/* Filename */}
        <p
          className="truncate text-xs font-semibold"
          style={{ color: "var(--text-1)" }}
          title={file.filename}
        >
          {file.filename}
        </p>

        {/* Reasons */}
        <ul className="flex flex-col gap-0.5">
          {reasons.slice(0, 3).map((r, i) => (
            <li key={i} className="flex gap-1.5 text-xs" style={{ color: "var(--text-2)" }}>
              <span style={{ color: "var(--text-3)", flexShrink: 0 }}>–</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>

        {/* Color swatches */}
        {features.colors.length > 0 && (
          <div className="flex gap-1.5">
            {features.colors.slice(0, 5).map((c, index) => (
              <Tooltip key={`${file.id}-${c.hex}-${index}`}>
                <TooltipTrigger>
                  <span
                    className="inline-block h-4 w-4 cursor-default rounded-full"
                    style={{
                      background: c.hex,
                      border: "1.5px solid rgba(255,255,255,0.08)",
                    }}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">{c.hex}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}

        {/* Action row */}
        <div className="mt-auto flex items-center gap-1 pt-1">
          <Tooltip>
            <TooltipTrigger>
              <button
                type="button"
                className="flex h-7 flex-1 items-center justify-center rounded-md text-xs font-semibold transition-all"
                style={
                  isPinned
                    ? {
                        background: "rgba(200,245,66,0.12)",
                        color: "var(--lime)",
                        border: "1px solid rgba(200,245,66,0.25)",
                      }
                    : {
                        background: "var(--surface-4)",
                        color: "var(--text-2)",
                        border: "1px solid transparent",
                      }
                }
                onClick={() => (isPinned ? onUnpin(file.id) : onPin(file.id))}
              >
                {isPinned ? "Unpin" : "Pin"}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{isPinned ? "Remove pin" : "Keep across reruns"}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger>
              <button
                type="button"
                className="flex h-7 flex-1 items-center justify-center rounded-md text-xs font-semibold transition-all"
                style={{
                  background: "var(--surface-4)",
                  color: "var(--text-3)",
                  border: "1px solid transparent",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = "var(--warn-color)";
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(245,166,35,0.08)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = "var(--text-3)";
                  (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-4)";
                }}
                onClick={() => onMarkSimilar(file.id)}
              >
                Similar
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Flag as too repetitive</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger>
              <button
                type="button"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs transition-all"
                style={{
                  background: "var(--surface-4)",
                  color: "var(--text-3)",
                  border: "1px solid transparent",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = "var(--error-color)";
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(245,66,66,0.08)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = "var(--text-3)";
                  (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-4)";
                }}
                onClick={() => onRemove(file.id)}
              >
                ✕
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Remove from board</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
