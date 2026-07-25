"use client";

import React, { useState } from "react";
import type { CreativeDirection } from "@/core/types";

interface Props { direction: CreativeDirection; }

function TagList({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-md px-2 py-0.5 text-xs font-medium capitalize"
          style={{
            background: "var(--surface-4)",
            color: "var(--text-2)",
            border: "1px solid var(--border-1)",
          }}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function Row({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="t-label">{label}</span>
      <TagList items={items} />
    </div>
  );
}

export function CreativeDirectionPanel({ direction }: Props) {
  const [open, setOpen] = useState(true);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--surface-3)", border: "1px solid var(--border-1)" }}
    >
      <button type="button" className="panel-toggle" onClick={() => setOpen((o) => !o)}>
        <span className="t-title">Creative Direction</span>
        <span className="t-caption">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div
          className="flex flex-col gap-4 px-4 pb-4"
          style={{ borderTop: "1px solid var(--border-1)" }}
        >
          <div className="pt-3 flex flex-col gap-3">
            <Row label="Subject"     items={direction.subject} />
            <Row label="Audience"    items={direction.audience} />
            <Row label="Mood"        items={direction.mood} />
            <Row label="Style"       items={direction.style} />
            <Row label="Colors"      items={direction.colors} />
            <Row label="Format"      items={direction.formats} />
          </div>

          {direction.ambiguities.length > 0 && (
            <div
              className="rounded-lg px-3 py-2.5 text-xs"
              style={{
                background: "rgba(245,166,35,0.07)",
                border: "1px solid rgba(245,166,35,0.18)",
                color: "var(--warn-color)",
              }}
            >
              <span className="font-semibold block mb-0.5">Ambiguity detected</span>
              {direction.ambiguities.join(" ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
