import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { buildExportPackage } from "@/core/exporter";
import type { AnalysisResult, PaletteSet } from "@/core/types";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/export
// Accepts a JSON body with the analysis result and selected IDs.
// Returns a ZIP archive for download.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: {
    result: AnalysisResult;
    selectedIds: string[];
    paletteSetId?: keyof PaletteSet;
    files?: Record<string, string>; // id → base64 encoded file content
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { result, selectedIds, paletteSetId = "extracted", files = {} } = body;

  if (!result || !selectedIds) {
    return NextResponse.json(
      { error: "Missing required fields: result, selectedIds." },
      { status: 400 }
    );
  }

  // Reconstruct file buffers from base64
  const fileBuffers = new Map<string, Buffer>();
  for (const [id, b64] of Object.entries(files)) {
    fileBuffers.set(id, Buffer.from(b64, "base64"));
  }

  const pkg = buildExportPackage(result, selectedIds, fileBuffers, paletteSetId);

  // Assemble ZIP using JSZip
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  for (const file of pkg.files) {
    if (typeof file.content === "string") {
      zip.file(file.archivePath, file.content);
    } else {
      zip.file(file.archivePath, file.content);
    }
  }

  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return new Response(zipBuffer as unknown as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="creative-reference-package.zip"`,
      "Cache-Control": "no-cache",
    },
  });
}
