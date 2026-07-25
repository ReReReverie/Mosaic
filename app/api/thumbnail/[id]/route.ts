import type { NextRequest } from "next/server";
import { getThumbnail } from "@/lib/thumbnailCache";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/thumbnail/[id]
// Returns the cached thumbnail for a reference by id.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";

// 1×1 transparent PNG — returned when no thumbnail is available
const PLACEHOLDER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const entry = getThumbnail(id);

  if (!entry) {
    return new Response(PLACEHOLDER_PNG, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  return new Response(entry.buffer as unknown as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": entry.mimeType,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
