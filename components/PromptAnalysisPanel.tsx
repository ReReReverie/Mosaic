import { ANALYZER_DIMENSION_LABELS, type PromptAnalysis } from "@/core/types";

export function PromptAnalysisPanel({ analysis }: { analysis: PromptAnalysis }) {
  return (
    <details
      className="rounded-xl p-4"
      style={{ background: "var(--surface-3)", border: "1px solid var(--border-1)" }}
      aria-labelledby="prompt-analysis-heading"
    >
      <summary className="cursor-pointer">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="t-label">Prompt profile</p>
            <h2 id="prompt-analysis-heading" className="t-title">Defaults and overrides</h2>
          </div>
          <span className="t-caption" style={{ color: "var(--text-3)" }}>
            {analysis.dimensions.filter((dimension) => dimension.source === "prompt").length} prompt · {analysis.dimensions.filter((dimension) => dimension.source === "default").length} default
          </span>
        </div>
      </summary>
      <div className="mt-3">
        <p className="t-caption mb-3" style={{ color: "var(--text-2)", lineHeight: 1.5 }}>
          {analysis.summary}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
        {analysis.dimensions.map((dimension) => (
          <div
            key={dimension.dimension}
            className="rounded-lg p-2.5"
            style={{ background: "var(--surface-4)", border: "1px solid var(--border-1)" }}
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                {ANALYZER_DIMENSION_LABELS[dimension.dimension]}
              </span>
              <span
                className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                style={{
                  color: dimension.source === "prompt" ? "var(--lime)" : "var(--text-3)",
                  background: dimension.source === "prompt" ? "rgba(200,245,66,0.1)" : "rgba(255,255,255,0.04)",
                }}
              >
                {dimension.source === "prompt" ? "Prompt" : "Default"}
              </span>
            </div>
            <p className="text-xs" style={{ color: "var(--text-1)", lineHeight: 1.4 }}>
              {dimension.details.join(" · ")}
            </p>
          </div>
        ))}
        </div>
      </div>
    </details>
  );
}
