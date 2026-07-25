"use client";

import React, { useState } from "react";
import type { CreativeDirection } from "@/core/types";

interface Props { direction: CreativeDirection; }

function Chip({ label }: { label: string }) {
  return (
    <span className="inline-block rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
      {label}
    </span>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</span>
      <div className="flex flex-wrap gap-1">
        {items.map((item) => <Chip key={item} label={item} />)}
      </div>
    </div>
  );
}

export function CreativeDirectionPanel({ direction }: Props) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <button
        type="button"
        className="flex w-full items-center justify-between p-3 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-sm font-semibold text-gray-800">Creative Direction</span>
        <span className="text-gray-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-gray-100 p-3">
          <Section title="Subject" items={direction.subject} />
          <Section title="Audience" items={direction.audience} />
          <Section title="Mood" items={direction.mood} />
          <Section title="Style" items={direction.style} />
          <Section title="Colors" items={direction.colors} />
          <Section title="Formats" items={direction.formats} />
          {direction.ambiguities.length > 0 && (
            <div className="rounded bg-amber-50 p-2 text-xs text-amber-800">
              <span className="font-semibold">Ambiguity detected:</span>{" "}
              {direction.ambiguities.join(" ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
