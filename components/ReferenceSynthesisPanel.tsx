import { ANALYZER_DIMENSION_LABELS, type ReferenceSynthesis } from "@/core/types";

export function ReferenceSynthesisPanel({ synthesis }: { synthesis: ReferenceSynthesis }) {
  return (
    <details
      className="rounded-xl p-4"
      style={{ background: "var(--surface-3)", border: "1px solid var(--border-1)" }}
      aria-labelledby="reference-synthesis-heading"
    >
      <summary className="cursor-pointer">
        <p className="t-label">Set-level read</p>
        <h2 id="reference-synthesis-heading" className="t-title">How to combine the references</h2>
      </summary>
      <div className="mt-3">
        <p className="t-caption mb-3" style={{ color: "var(--text-2)", lineHeight: 1.5 }}>
          {synthesis.summary}
        </p>

      {synthesis.suggestedCombination.length > 0 && (
        <div className="mb-3 flex flex-col gap-2">
          <p className="t-label">Suggested combination</p>
          {synthesis.suggestedCombination.map((suggestion) => (
            <div key={`${suggestion.dimension}-${suggestion.referenceIds.join("-")}`} className="rounded-lg p-2.5" style={{ background: "var(--surface-4)" }}>
              <div className="flex items-center justify-between gap-2">
                <strong className="text-xs" style={{ color: "var(--text-1)" }}>
                  {ANALYZER_DIMENSION_LABELS[suggestion.dimension]}
                </strong>
                <span className="text-[10px] font-semibold" style={{ color: "var(--lime)" }}>
                  {suggestion.referenceIds.join(" · ")}
                </span>
              </div>
              <p className="mt-1 text-[11px]" style={{ color: "var(--text-2)", lineHeight: 1.4 }}>
                {suggestion.reason}
              </p>
            </div>
          ))}
        </div>
      )}

      {synthesis.coverageGaps.length > 0 && (
        <div className="mb-3 rounded-lg p-3" style={{ background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.18)" }}>
          <p className="t-label mb-1" style={{ color: "var(--warn-color)" }}>Coverage gaps</p>
          {synthesis.coverageGaps.map((gap) => (
            <p key={gap.dimension} className="text-[11px]" style={{ color: "var(--text-2)", lineHeight: 1.4 }}>
              <strong>{ANALYZER_DIMENSION_LABELS[gap.dimension]}:</strong> {gap.reason}
            </p>
          ))}
        </div>
      )}

        {synthesis.conflicts.length > 0 && (
        <div className="rounded-lg p-3" style={{ background: "rgba(245,66,66,0.07)", border: "1px solid rgba(245,66,66,0.16)" }}>
          <p className="t-label mb-1" style={{ color: "var(--error-color)" }}>Conflicts to resolve</p>
          {synthesis.conflicts.map((conflict) => (
            <p key={`${conflict.referenceIds.join("-")}-${conflict.dimensions.join("-")}`} className="text-[11px]" style={{ color: "var(--text-2)", lineHeight: 1.4 }}>
              <strong>{conflict.referenceIds.join(" · ")}:</strong> {conflict.reason}
            </p>
          ))}
        </div>
        )}
      </div>
    </details>
  );
}
