"use client";

import React, { useRef, useState } from "react";

interface BriefInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

const EXAMPLES = [
  "Find references for a warm, editorial poster about local food for young adults.",
  "I need references for a clean, minimalist logo for a tech startup.",
  "Gather dark, moody, photographic references for a music album campaign.",
];

export function BriefInput({ value, onChange, onSubmit, isLoading }: BriefInputProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="brief" className="text-sm font-semibold text-gray-700">
        Creative Brief
      </label>
      <textarea
        id="brief"
        className="w-full resize-none rounded-md border border-gray-300 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        rows={3}
        placeholder="Describe what you're looking for…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={1000}
        disabled={isLoading}
      />
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{value.length}/1000</span>
        <div className="flex gap-2">
          {EXAMPLES.map((ex, i) => (
            <button
              key={i}
              type="button"
              className="text-blue-500 hover:underline"
              onClick={() => onChange(ex)}
              disabled={isLoading}
            >
              Example {i + 1}
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        className="mt-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        onClick={onSubmit}
        disabled={isLoading || value.trim().length < 5}
      >
        {isLoading ? "Analysing…" : "Analyse References"}
      </button>
    </div>
  );
}
