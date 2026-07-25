import { describe, it, expect } from "vitest";
import path from "path";
import { sanitizePath, isSafePath } from "./pathSanitizer";

const ROOT = "/safe/root";

describe("sanitizePath", () => {
  it("accepts a safe relative path", () => {
    const result = sanitizePath("images/photo.jpg", ROOT);
    expect(result).toBe(path.resolve(ROOT, "images/photo.jpg"));
  });

  it("accepts a nested safe path", () => {
    const result = sanitizePath("a/b/c/file.png", ROOT);
    expect(result).not.toBeNull();
    expect(result!.startsWith(path.resolve(ROOT))).toBe(true);
  });

  it("rejects a simple traversal attempt", () => {
    expect(sanitizePath("../etc/passwd", ROOT)).toBeNull();
  });

  it("rejects a deeply nested traversal attempt", () => {
    expect(sanitizePath("images/../../etc/passwd", ROOT)).toBeNull();
  });

  it("rejects an absolute path that escapes root", () => {
    // An absolute path that doesn't start with root
    expect(sanitizePath("/etc/passwd", ROOT)).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(sanitizePath("", ROOT)).toBeNull();
  });

  it("returns null for empty root", () => {
    expect(sanitizePath("file.jpg", "")).toBeNull();
  });

  it("accepts the root itself", () => {
    const result = sanitizePath(".", ROOT);
    expect(result).toBe(path.resolve(ROOT));
  });

  it("does not accept a path that is a prefix match of root (e.g. /safe/root-extra)", () => {
    const trickyRoot = "/safe/root";
    // Try to escape to /safe/root-extra
    const result = sanitizePath("../root-extra/file.txt", trickyRoot);
    expect(result).toBeNull();
  });
});

describe("isSafePath", () => {
  it("accepts a normal relative path", () => {
    expect(isSafePath("images/photo.jpg")).toBe(true);
  });

  it("rejects paths starting with ..", () => {
    expect(isSafePath("../etc/passwd")).toBe(false);
  });

  it("rejects absolute paths", () => {
    expect(isSafePath("/etc/passwd")).toBe(false);
  });

  it("rejects null-byte paths", () => {
    expect(isSafePath("file\0name.jpg")).toBe(false);
  });
});
