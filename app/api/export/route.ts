import { NextResponse } from "next/server";
import type { AnalysisResult, PaletteSet } from "@/core/types";
import { buildExportPackage } from "@/core/exporter";

export const runtime = "nodejs";

const MAX_FILES = 200;
const MAX_TOTAL_BYTES = 250 * 1024 * 1024;
const PALETTE_IDS = new Set<keyof PaletteSet>([
  "extracted",
  "harmonized",
  "contrastAware",
]);

function parseJsonField(formData: FormData, field: string): unknown {
  const value = formData.get(field);
  if (typeof value !== "string") throw new Error(`Missing field: ${field}.`);
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${field} must contain valid JSON.`);
  }
}

function isAnalysisResult(value: unknown): value is AnalysisResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<AnalysisResult>;
  return (
    typeof result.sessionId === "string" &&
    typeof result.brief === "string" &&
    Array.isArray(result.references) &&
    result.references.every(
      (reference) =>
        reference &&
        typeof reference === "object" &&
        typeof reference.file?.id === "string" &&
        typeof reference.file?.filename === "string"
    ) &&
    !!result.palette &&
    !!result.styleDNA
  );
}

export async function POST(req: Request) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data." }, { status: 400 });
  }

  try {
    const resultValue = parseJsonField(formData, "result");
    const selectedValue = parseJsonField(formData, "selectedIds");
    const fileIdsValue = formData.get("fileIds");
    const fileIds =
      fileIdsValue === null
        ? []
        : parseJsonField(formData, "fileIds");

    if (!isAnalysisResult(resultValue)) {
      throw new Error("result is not a valid analysis result.");
    }
    if (
      !Array.isArray(selectedValue) ||
      selectedValue.length > MAX_FILES ||
      selectedValue.some((id) => typeof id !== "string")
    ) {
      throw new Error("selectedIds must be an array of reference IDs.");
    }
    if (
      !Array.isArray(fileIds) ||
      fileIds.length > MAX_FILES ||
      fileIds.some((id) => typeof id !== "string")
    ) {
      throw new Error("fileIds must be an array of reference IDs.");
    }

    const paletteValue = formData.get("paletteSetId") ?? "extracted";
    if (typeof paletteValue !== "string" || !PALETTE_IDS.has(paletteValue as keyof PaletteSet)) {
      throw new Error("paletteSetId is invalid.");
    }

    const entries = formData
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File);
    if (entries.length !== fileIds.length) {
      throw new Error("Each uploaded source file must have a matching reference ID.");
    }
    if (entries.length > MAX_FILES) {
      throw new Error(`A maximum of ${MAX_FILES} source files can be exported.`);
    }

    const totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new Error("The combined export source size cannot exceed 250 MB.");
    }

    const selectedIds = [...new Set(selectedValue as string[])];
    const selectedSet = new Set(selectedIds);
    const fileBuffers = new Map<string, Buffer>();
    for (let index = 0; index < entries.length; index += 1) {
      const id = fileIds[index] as string;
      if (selectedSet.has(id)) {
        fileBuffers.set(id, Buffer.from(await entries[index].arrayBuffer()));
      }
    }

    const pkg = buildExportPackage(
      resultValue,
      selectedIds,
      fileBuffers,
      paletteValue as keyof PaletteSet
    );
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    for (const file of pkg.files) zip.file(file.archivePath, file.content);

    const zipBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    return new Response(zipBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="creative-reference-package.zip"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid export request." },
      { status: 400 }
    );
  }
}
