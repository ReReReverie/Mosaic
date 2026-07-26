import type { RankedReference } from "@/core/types";

const MAX_ENTRIES = 200;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const MAX_ITEM_BYTES = 5 * 1024 * 1024;
const TTL_MS = 15 * 60 * 1000;

interface ThumbnailEntry {
  buffer: Buffer;
  mimeType: string;
  lastAccessedAt: number;
}

const cache = new Map<string, ThumbnailEntry>();
let cacheBytes = 0;

function removeThumbnail(id: string): void {
  const existing = cache.get(id);
  if (!existing) return;
  cacheBytes -= existing.buffer.byteLength;
  cache.delete(id);
}

function storeThumbnail(id: string, buffer: Buffer, mimeType: string): void {
  if (buffer.byteLength > MAX_ITEM_BYTES) return;
  removeThumbnail(id);
  cache.set(id, { buffer, mimeType, lastAccessedAt: Date.now() });
  cacheBytes += buffer.byteLength;

  while (cache.size > MAX_ENTRIES || cacheBytes > MAX_TOTAL_BYTES) {
    const oldest = cache.entries().next().value as [string, ThumbnailEntry] | undefined;
    if (!oldest) break;
    removeThumbnail(oldest[0]);
  }
}

/** Register bounded, short-lived previews for image references. */
export async function registerThumbnails(
  refs: RankedReference[],
  buffers: Map<string, Buffer>
): Promise<void> {
  for (const ref of refs) {
    if (!ref.file.mimeType.startsWith("image/")) continue;
    const buf = buffers.get(ref.file.id);
    if (!buf) continue;

    if (ref.file.mimeType !== "image/svg+xml") {
      try {
        const sharp = (await import("sharp")).default;
        const thumb = await sharp(buf)
          .resize({ width: 400, height: 400, fit: "inside" })
          .jpeg({ quality: 80 })
          .toBuffer();
        storeThumbnail(ref.file.id, thumb, "image/jpeg");
        continue;
      } catch {
        // Store the original only when it is small enough to keep safely.
      }
    }

    storeThumbnail(ref.file.id, buf, ref.file.mimeType);
  }
}

export function getThumbnail(id: string): { buffer: Buffer; mimeType: string } | null {
  const entry = cache.get(id);
  if (!entry) return null;
  if (Date.now() - entry.lastAccessedAt > TTL_MS) {
    removeThumbnail(id);
    return null;
  }
  entry.lastAccessedAt = Date.now();
  return { buffer: entry.buffer, mimeType: entry.mimeType };
}
