"use client";

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { BriefInput } from "@/components/BriefInput";
import { FolderUpload } from "@/components/FolderUpload";
import { ProgressBar } from "@/components/ProgressBar";
import { useBoardStore } from "@/lib/store";
import { scanFiles } from "@/core/scanner";
import type { ProgressEvent, ScoringWeights } from "@/core/types";
import { DEFAULT_SCORING_WEIGHTS } from "@/core/types";

export default function HomePage() {
  const router = useRouter();
  const { brief, setBrief, setResult, scoringWeights } = useBoardStore();
  const [files, setFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze() {
    if (!brief.trim() || files.length === 0) return;

    setIsLoading(true);
    setError(null);
    setProgress(0);
    setProgressMessage("Preparing files…");

    try {
      // Build form data
      const formData = new FormData();
      formData.append("brief", brief);
      formData.append("weights", JSON.stringify(scoringWeights));
      formData.append("pinnedIds", "[]");
      formData.append("removedIds", "[]");

      for (const file of files) {
        formData.append("files", file);
      }

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Server returned ${response.status}`);
      }

      // Read NDJSON stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event: ProgressEvent = JSON.parse(line);
            setProgress(event.progress);
            setProgressMessage(event.message);

            if (event.type === "error") {
              throw new Error(event.error ?? "Analysis failed");
            }

            if (event.type === "done" && event.result) {
              setResult(event.result);
              router.push("/board");
              return;
            }
          } catch (parseErr) {
            // Ignore malformed lines
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-16">
        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="text-2xl font-bold text-gray-900">
            Creative Reference Assistant
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Enter a creative brief, upload your reference folder, and get a
            ranked moodboard with explainable insights.
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-6">
            <BriefInput
              value={brief}
              onChange={setBrief}
              onSubmit={handleAnalyze}
              isLoading={isLoading}
            />
            <FolderUpload
              onFilesSelected={setFiles}
              selectedCount={files.length}
              isLoading={isLoading}
            />

            {isLoading && (
              <ProgressBar progress={progress} message={progressMessage} />
            )}

            {error && (
              <div className="rounded bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-gray-400">
          No images are generated. References are analyzed from your own files.
        </p>
      </div>
    </main>
  );
}
