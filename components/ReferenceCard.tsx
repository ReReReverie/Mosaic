"use client";

import React from "react";
import Image from "next/image";
import type { RankedReference } from "@/core/types";

interface ReferenceCardProps {
  reference: RankedReference;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
  onRemove: (id: string) => void;
  onMarkSimilar: (id: string) => void;
}

function scoreLabel(score: number): { label: string; color: string } {
  if (score >= 0.75) return { label: "Strong match", color: "text-green-700 bg-green-50" };
  if (score >= 0.5) return { label: "Good match", color: "text-blue-700 bg-blue-50" };
  if (score >= 0.3) return { label: "Partial match", color: "text-yellow-700 bg-yellow-50" };
  return { label: "Weak match", color: "text-gray-600 bg-gray-100" };
}

export function ReferenceCard({
  reference,
  onPin,
  onUnpin,
  onRemove,
  onMarkSimilar,
}: ReferenceCardProps) {
  const { file, features, score, reasons, isPinned, isTooSimilar } = reference;
  const { label, color } = scoreLabel(score);

  const isImage = file.mimeType.startsWith("image/");

  return (
    <div
      className={`flex flex-col rounded-lg border bg-white transition-opacity ${
        reference.isRemoved ? "opacity-30" : ""
      } ${isPinned ? "border-blue-400 ring-1 ring-blue-400" : "border-gray-200"}`}
    >
      {/* Thumbnail */}
      <div className="relative flex h-40 w-full items-center justify-center overflow-hidden rounded-t-lg bg-gray-100">
        {isImage ? (
          <Image
            src={`/api/thumbnail/${file.id}`}
            alt={file.filename}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 220px"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-gray-400">
            <span className="text-3xl">{file.mimeType === "application/pdf" ? "📄" : "📝"}</span>
            <span className="text-xs uppercase">{file.mimeType.split("/").pop()}</span>
          </div>
        )}
        {isPinned && (
          <span className="absolute left-2 top-2 rounded bg-blue-500 px-1.5 py-0.5 text-xs font-bold text-white">
            Pinned
          </span>
        )}
        {isTooSimilar && (
          <span className="absolute right-2 top-2 rounded bg-amber-400 px-1.5 py-0.5 text-xs font-bold text-white">
            Similar
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-1 text-xs font-semibold text-gray-800" title={file.filename}>
            {file.filename}
          </p>
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${color}`}>
            {label}
          </span>
        </div>

        {/* Reasons */}
        <ul className="flex flex-col gap-0.5">
          {reasons.slice(0, 3).map((r, i) => (
            <li key={i} className="text-xs text-gray-600 before:mr-1 before:text-gray-400 before:content-['–']">
              {r}
            </li>
          ))}
        </ul>

        {/* Color swatches */}
        {features.colors.length > 0 && (
          <div className="flex gap-1">
            {features.colors.slice(0, 5).map((c) => (
              <span
                key={c.hex}
                title={c.hex}
                className="inline-block h-4 w-4 rounded-full border border-gray-200"
                style={{ background: c.hex }}
              />
            ))}
          </div>
        )}

        {/* Controls */}
        <div className="mt-auto flex gap-1 pt-1">
          <button
            type="button"
            className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
              isPinned
                ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
            onClick={() => (isPinned ? onUnpin(file.id) : onPin(file.id))}
          >
            {isPinned ? "Unpin" : "Pin"}
          </button>
          <button
            type="button"
            className="flex-1 rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-amber-100 hover:text-amber-700"
            onClick={() => onMarkSimilar(file.id)}
          >
            Similar
          </button>
          <button
            type="button"
            className="flex-1 rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-red-100 hover:text-red-700"
            onClick={() => onRemove(file.id)}
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
