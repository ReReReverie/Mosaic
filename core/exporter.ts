import type {
  AnalysisResult,
  ExportManifest,
  PaletteSet,
} from "./types";
import { sanitizePath } from "./pathSanitizer";
import path from "path";

// ─────────────────────────────────────────────────────────────────────────────
// Export Engine
// Assembles the export package: JSON reports + posterboard.html + README.txt
// ─────────────────────────────────────────────────────────────────────────────

export interface ExportFile {
  /** Path within the ZIP archive */
  archivePath: string;
  content: Buffer | string;
  mimeType: string;
}

export interface ExportPackage {
  manifest: ExportManifest;
  files: ExportFile[];
}

const VERSION = "1.0.0";

// ─── Posterboard HTML template ────────────────────────────────────────────────

function buildPosterboardHtml(
  result: AnalysisResult,
  selectedIds: string[]
): string {
  const selected = result.references.filter((r) =>
    selectedIds.includes(r.file.id)
  );

  const cards = selected
    .map(
      (ref) => {
        const safeColors = ref.features.colors
          .slice(0, 5)
          .map((color) =>
            /^#[0-9a-f]{3,8}$/i.test(color.hex) ? color.hex : "#000000"
          );
        return `
    <div class="card">
      <div class="card-thumb" style="background:#f7f8fa;display:flex;align-items:center;justify-content:center;min-height:160px;font-size:12px;color:#57606a;">
        [${escapeHtml(ref.file.mimeType)}]
      </div>
      <div class="card-body">
        <div class="card-filename">${escapeHtml(ref.file.filename)}</div>
        <div class="card-score">Match: ${Math.round(ref.score * 100)}%</div>
        <ul class="card-reasons">
          ${ref.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}
        </ul>
        <div class="card-colors">
          ${safeColors
            .map((color) => `<span class="swatch" title="${escapeHtml(color)}" style="background:${color}"></span>`)
            .join("")}
        </div>
      </div>
    </div>`
      }
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Posterboard — ${escapeHtml(result.brief)}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", system-ui, sans-serif; background: #fff; color: #1f2328; margin: 0; padding: 24px; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .brief { font-size: 14px; color: #57606a; margin-bottom: 24px; }
  .board { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
  .card { border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
  .card-body { padding: 12px; }
  .card-filename { font-size: 13px; font-weight: 600; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .card-score { font-size: 12px; color: #57606a; margin-bottom: 6px; }
  .card-reasons { margin: 0 0 8px; padding-left: 16px; font-size: 12px; color: #1f2328; }
  .card-reasons li { margin-bottom: 2px; }
  .card-colors { display: flex; gap: 4px; flex-wrap: wrap; }
  .swatch { display: inline-block; width: 18px; height: 18px; border-radius: 50%; border: 1px solid #e5e7eb; }
  .dna { margin-top: 32px; padding: 16px; background: #f7f8fa; border-radius: 8px; }
  .dna h2 { font-size: 16px; margin-bottom: 8px; }
  footer { margin-top: 32px; font-size: 11px; color: #57606a; border-top: 1px solid #e5e7eb; padding-top: 12px; text-align: center; }
</style>
</head>
<body>
<h1>Creative Reference Board</h1>
<p class="brief">${escapeHtml(result.brief)}</p>
<div class="board">
${cards}
</div>
<div class="dna">
  <h2>Style DNA</h2>
  <p>${escapeHtml(result.styleDNA.summary)}</p>
</div>
<footer>Exported by Creative Reference Assistant · ${new Date(result.analyzedAt).toLocaleDateString()}</footer>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the complete export package as an array of ExportFile objects.
 * The caller (API route) assembles these into a ZIP using JSZip.
 */
export function buildExportPackage(
  result: AnalysisResult,
  selectedIds: string[],
  fileBuffers: Map<string, Buffer>,
  paletteSetId: keyof PaletteSet = "extracted"
): ExportPackage {
  const manifest: ExportManifest = {
    sessionId: result.sessionId,
    brief: result.brief,
    exportedAt: Date.now(),
    selectedReferenceIds: selectedIds,
    paletteSetId,
    version: VERSION,
  };

  const files: ExportFile[] = [];

  // ── JSON reports ──────────────────────────────────────────────────────────
  files.push({
    archivePath: "manifest.json",
    content: JSON.stringify(manifest, null, 2),
    mimeType: "application/json",
  });

  files.push({
    archivePath: "palette-report.json",
    content: JSON.stringify(result.palette, null, 2),
    mimeType: "application/json",
  });

  files.push({
    archivePath: "style-dna.json",
    content: JSON.stringify(result.styleDNA, null, 2),
    mimeType: "application/json",
  });

  files.push({
    archivePath: "creative-direction.json",
    content: JSON.stringify(result.creativeDirection, null, 2),
    mimeType: "application/json",
  });

  files.push({
    archivePath: "accessibility-report.json",
    content: JSON.stringify(result.accessibilityFindings, null, 2),
    mimeType: "application/json",
  });

  // ── Posterboard HTML ──────────────────────────────────────────────────────
  files.push({
    archivePath: "posterboard.html",
    content: buildPosterboardHtml(result, selectedIds),
    mimeType: "text/html",
  });

  // ── README ────────────────────────────────────────────────────────────────
  files.push({
    archivePath: "README.txt",
    content: [
      "Creative Reference Package",
      "=========================",
      "",
      `Brief: ${result.brief}`,
      `Exported: ${new Date(manifest.exportedAt).toISOString()}`,
      `Session: ${result.sessionId}`,
      "",
      "Files",
      "-----",
      "posterboard.html         Open in a browser for a visual reference board",
      "palette-report.json      Colour palette recommendations",
      "style-dna.json           Visual DNA analysis of selected references",
      "creative-direction.json  Structured creative direction extracted from brief",
      "accessibility-report.json  Accessibility and contrast findings",
      "manifest.json            Export metadata",
      "references/              Selected source files",
      "",
      "Generated by Creative Reference Assistant",
    ].join("\n"),
    mimeType: "text/plain",
  });

  // ── Reference files ───────────────────────────────────────────────────────
  const SAFE_ARCHIVE_ROOT = "references";
  const selected = result.references.filter((r) =>
    selectedIds.includes(r.file.id)
  );

  for (const ref of selected) {
    const buf = fileBuffers.get(ref.file.id);
    if (!buf) continue;

    // Sanitize the filename — prevent traversal within the archive
    const safeName = path.basename(ref.file.filename);
    const archivePath = `${SAFE_ARCHIVE_ROOT}/${safeName}`;

    // Validate (double-check using sanitizePath against a virtual root)
    const virtualRoot = `/${SAFE_ARCHIVE_ROOT}`;
    const sanitized = sanitizePath(safeName, virtualRoot);
    if (!sanitized) continue; // Skip if path is unsafe

    files.push({
      archivePath,
      content: buf,
      mimeType: ref.file.mimeType,
    });
  }

  return { manifest, files };
}
