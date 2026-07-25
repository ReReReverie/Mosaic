import { describe, it, expect } from "vitest";
import { scanFiles } from "./scanner";
import type { FileInput } from "./scanner";

function makeBrowserInput(
  name: string,
  size = 1000,
  mime = ""
): FileInput {
  return {
    type: "browser",
    file: {
      name,
      size,
      lastModified: 1000000,
      webkitRelativePath: `folder/${name}`,
      mimeType: mime,
    },
  };
}

function makeNodeInput(filename: string, sizeBytes = 1000): FileInput {
  return {
    type: "node",
    path: `/refs/${filename}`,
    filename,
    sizeBytes,
    lastModified: 1000000,
  };
}

describe("scanFiles", () => {
  it("accepts a supported image file", () => {
    const { files, skipped } = scanFiles([makeBrowserInput("photo.jpg")]);
    expect(files).toHaveLength(1);
    expect(files[0].mimeType).toBe("image/jpeg");
    expect(skipped).toHaveLength(0);
  });

  it("accepts a PDF file", () => {
    const { files } = scanFiles([makeBrowserInput("brief.pdf")]);
    expect(files).toHaveLength(1);
    expect(files[0].mimeType).toBe("application/pdf");
  });

  it("accepts SVG, PNG, WebP, and Markdown", () => {
    const inputs = [
      makeBrowserInput("logo.svg"),
      makeBrowserInput("banner.png"),
      makeBrowserInput("poster.webp"),
      makeBrowserInput("notes.md"),
    ];
    const { files, skipped } = scanFiles(inputs);
    expect(files).toHaveLength(4);
    expect(skipped).toHaveLength(0);
  });

  it("excludes video files", () => {
    const { files, skipped } = scanFiles([makeBrowserInput("clip.mp4")]);
    expect(files).toHaveLength(0);
    expect(skipped[0].reason).toBe("video excluded");
  });

  it("excludes oversized files", () => {
    const big = makeBrowserInput("huge.png", 100 * 1024 * 1024); // 100 MB
    const { files, skipped } = scanFiles([big]);
    expect(files).toHaveLength(0);
    expect(skipped[0].reason).toBe("file too large");
  });

  it("skips unsupported extensions", () => {
    const { files, skipped } = scanFiles([makeBrowserInput("design.psd")]);
    expect(files).toHaveLength(0);
    expect(skipped[0].reason).toBe("unsupported format");
  });

  it("generates a stable id across two calls for same file metadata", () => {
    const input = makeNodeInput("poster.png");
    const { files: a } = scanFiles([input]);
    const { files: b } = scanFiles([input]);
    expect(a[0].id).toBe(b[0].id);
  });

  it("generates different ids for different files", () => {
    const a = makeNodeInput("a.png", 100);
    const b = makeNodeInput("b.png", 200);
    const { files } = scanFiles([a, b]);
    expect(files[0].id).not.toBe(files[1].id);
  });

  it("handles a mixed batch correctly", () => {
    const inputs: FileInput[] = [
      makeBrowserInput("ref.jpg"),
      makeBrowserInput("clip.mov"),
      makeBrowserInput("unknown.xyz"),
      makeNodeInput("notes.txt", 500),
    ];
    const { files, skipped } = scanFiles(inputs);
    expect(files).toHaveLength(2);
    expect(skipped).toHaveLength(2);
  });

  it("respects a custom size limit", () => {
    const input = makeBrowserInput("medium.png", 2 * 1024 * 1024); // 2 MB
    const { files, skipped } = scanFiles([input], 1 * 1024 * 1024); // 1 MB limit
    expect(files).toHaveLength(0);
    expect(skipped[0].reason).toBe("file too large");
  });
});
