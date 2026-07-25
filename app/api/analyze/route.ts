import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { ReferenceFile, ScoringWeights } from "@/core/types";
import { DEFAULT_SCORING_WEIGHTS } from "@/core/types";
import { runAnalysis } from "@/core/orchestrator";
import type { ProgressEvent } from "@/core/types";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/analyze
// Accepts multipart form data: files + brief + optional weights/pinnedIds/removedIds.
// Streams NDJSON progress events back to the client.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
// Increase body size limit for file uploads
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const brief = formData.get("brief");
  if (!brief || typeof brief !== "string") {
    return NextResponse.json(
      { error: "Missing required field: brief." },
      { status: 400 }
    );
  }

  // Parse optional fields
  let weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS;
  const rawWeights = formData.get("weights");
  if (rawWeights && typeof rawWeights === "string") {
    try {
      weights = JSON.parse(rawWeights);
    } catch {
      // Ignore malformed weights — use defaults
    }
  }

  const pinnedIds: string[] = JSON.parse(
    (formData.get("pinnedIds") as string) ?? "[]"
  );
  const removedIds: string[] = JSON.parse(
    (formData.get("removedIds") as string) ?? "[]"
  );
  const apiKey = process.env.OPENAI_API_KEY ?? undefined;

  // Collect uploaded files
  const referenceFiles: ReferenceFile[] = [];
  const fileBuffers = new Map<string, Buffer>();

  const entries = formData.getAll("files");
  for (const entry of entries) {
    if (!(entry instanceof File)) continue;

    const arrayBuffer = await entry.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Build a stable id from name + size (mirrors scanner logic for browser uploads)
    const crypto = await import("crypto");
    const id = crypto
      .createHash("sha256")
      .update(`${entry.webkitRelativePath || entry.name}::${entry.size}::${entry.lastModified}`)
      .digest("hex")
      .slice(0, 32);

    const file: ReferenceFile = {
      id,
      path: entry.webkitRelativePath || entry.name,
      filename: entry.name,
      mimeType: entry.type || "application/octet-stream",
      sizeBytes: entry.size,
      lastModified: entry.lastModified,
    };

    referenceFiles.push(file);
    fileBuffers.set(id, buffer);
  }

  // Thumbnail cache — store in module scope for the thumbnail API route
  const { registerThumbnails } = await import("@/lib/thumbnailCache");

  // Stream NDJSON
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const generator = runAnalysis({
          files: referenceFiles,
          brief,
          weights,
          apiKey,
          pinnedIds,
          removedIds,
          readFile: async (file) => fileBuffers.get(file.id) ?? Buffer.alloc(0),
        });

        for await (const event of generator) {
          const line = JSON.stringify(event) + "\n";
          controller.enqueue(encoder.encode(line));

          // When analysis is done, register thumbnails
          if (event.type === "done" && event.result) {
            await registerThumbnails(
              event.result.references,
              fileBuffers
            );
          }
        }
      } catch (err) {
        const errorEvent: ProgressEvent = {
          type: "error",
          progress: 0,
          message: "Analysis failed.",
          error: err instanceof Error ? err.message : String(err),
        };
        controller.enqueue(encoder.encode(JSON.stringify(errorEvent) + "\n"));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "Transfer-Encoding": "chunked",
    },
  });
}
