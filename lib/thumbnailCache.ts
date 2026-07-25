import type { RankedReference } from "@/core/types";

// ─────────────────────────────────────────────────────────────────────────────
// Thumbnail Cache
// Server-side in-memory map from reference id → thumbnail Buffer.
// Populated during analysis; read by the thumbnail API route.
// ─────────────────────────────────────────────────────────────────────────────

// Map<referenceId, { buffer: Buffer; mimeType: string }>
const cache = new Map<string, { buffer: Buffer; mimeType: string }>();

/**
 * Register thumbnails for all analyzed references.
 * For image files the original buffer is stored as-is (Sharp resizes on demand).
 * For PDFs and SVGs we store whatever is available.
 */
export async function registerThumbnails(
  refs: RankedReference[],
  buffers: Map<string, Buffer>
): Promise<void> {
  for (const ref of refs) {
    const buf = buffers.get(ref.file.id);
    if (!buf) continue;

    // For images, generate a 400px thumbnail using Sharp
    if (ref.file.mimeType.startsWith("image/") && ref.file.mimeType !== "image/svg+xml") {
      try {
        const sharp = (await import("sharp")).default;
        const thumb = await sharp(buf)
          .resize({ width: 400, height: 400, fit: "inside" })
          .jpeg({ quality: 80 })
          .toBuffer();
        cache.set(ref.file.id, { buffer: thumb, mimeType: "image/jpeg" });
      } catch {
        // Fall back to storing the original
        cache.set(ref.file.id, { buffer: buf, mimeType: ref.file.mimeType });
      }
    } else {
      // SVG, PDF, text — store original for now
      cache.set(ref.file.id, { buffer: buf, mimeType: ref.file.mimeType });
    }
  }
}

export function getThumbnail(
  id: string
): { buffer: Buffer; mimeType: string } | null {
  return cache.get(id) ?? null;
}
