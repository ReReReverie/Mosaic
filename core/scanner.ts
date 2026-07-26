import type { ReferenceFile, SkippedFile } from "./types";
import crypto from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Supported and excluded MIME types
// ─────────────────────────────────────────────────────────────────────────────

const EXTENSION_TO_MIME: Record<string, string> = {
  // Raster images
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  // Vector
  svg: "image/svg+xml",
  // Documents
  pdf: "application/pdf",
  // Text formats
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  html: "text/html",
  htm: "text/html",
  json: "application/json",
  csv: "text/csv",
};

const VIDEO_EXTENSIONS = new Set([
  "mp4", "mov", "avi", "mkv", "webm", "flv", "wmv", "m4v", "ogv", "3gp",
]);

const SUPPORTED_MIME_TYPES = new Set(Object.values(EXTENSION_TO_MIME));

/** 50 MB default max file size */
const DEFAULT_MAX_SIZE_BYTES = 50 * 1024 * 1024;

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface BrowserFileInput {
  type: "browser";
  file: {
    name: string;
    size: number;
    lastModified: number;
    /** Relative path from the folder root (set by webkitdirectory) */
    webkitRelativePath: string;
    /** MIME type reported by the browser (may be empty string) */
    mimeType: string;
  };
}

export interface NodeFileInput {
  type: "node";
  path: string;
  filename: string;
  sizeBytes: number;
  lastModified: number;
}

export type FileInput = BrowserFileInput | NodeFileInput;

export interface ScanResult {
  files: ReferenceFile[];
  skipped: SkippedFile[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getExtension(filename: string): string {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

/**
 * Derive a stable id from path + size + lastModified so the same file
 * always gets the same id across re-scans.
 */
function deriveId(path: string, sizeBytes: number, lastModified: number): string {
  const raw = `${path}::${sizeBytes}::${lastModified}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

function classifyMime(filename: string, browserMime?: string): string | null {
  const ext = getExtension(filename);
  // Prefer extension map (more reliable than browser-reported MIME)
  if (EXTENSION_TO_MIME[ext]) return EXTENSION_TO_MIME[ext];
  // Fall back to browser-reported MIME
  if (browserMime && SUPPORTED_MIME_TYPES.has(browserMime)) return browserMime;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main scanner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classifies a list of file inputs into accepted ReferenceFiles and SkippedFiles.
 * Does NOT read file contents — only inspects metadata.
 */
export function scanFiles(
  inputs: FileInput[],
  maxSizeBytes = DEFAULT_MAX_SIZE_BYTES
): ScanResult {
  const files: ReferenceFile[] = [];
  const skipped: SkippedFile[] = [];

  for (const input of inputs) {
    const filename =
      input.type === "browser" ? input.file.name : input.filename;
    const path =
      input.type === "browser"
        ? input.file.webkitRelativePath || input.file.name
        : input.path;
    const sizeBytes =
      input.type === "browser" ? input.file.size : input.sizeBytes;
    const lastModified =
      input.type === "browser" ? input.file.lastModified : input.lastModified;
    const browserMime =
      input.type === "browser" ? input.file.mimeType : undefined;

    const ext = getExtension(filename);

    // Always exclude videos
    if (VIDEO_EXTENSIONS.has(ext)) {
      skipped.push({
        path,
        reason: "video excluded",
        details: `Extension ".${ext}" is a video format and is always excluded.`,
      });
      continue;
    }

    // Size check
    if (sizeBytes > maxSizeBytes) {
      skipped.push({
        path,
        reason: "file too large",
        details: `File is ${(sizeBytes / 1024 / 1024).toFixed(1)} MB, limit is ${(maxSizeBytes / 1024 / 1024).toFixed(0)} MB.`,
      });
      continue;
    }

    // MIME classification
    const mimeType = classifyMime(filename, browserMime);
    if (!mimeType) {
      skipped.push({
        path,
        reason: "unsupported format",
        details: `Extension ".${ext}" is not supported.`,
      });
      continue;
    }

    files.push({
      id: deriveId(path, sizeBytes, lastModified),
      path,
      filename,
      mimeType,
      sizeBytes,
      lastModified,
    });
  }

  return { files, skipped };
}
