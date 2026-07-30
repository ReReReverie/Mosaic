import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateThumbnailSize, createBrowserThumbnail } from "./browserThumbnail";

let imageWidth = 1600;
let imageHeight = 800;
let imageDecodeFails = false;
let canvasContextAvailable = true;
let canvasEncodeFails = false;

const createObjectURL = vi.fn(() => "blob:test-thumbnail");
const revokeObjectURL = vi.fn();
const drawImage = vi.fn();
const toDataURL = vi.fn();

class MockImage {
  naturalWidth = imageWidth;
  naturalHeight = imageHeight;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  set src(_value: string) {
    queueMicrotask(() => {
      if (imageDecodeFails) this.onerror?.();
      else this.onload?.();
    });
  }
}

function makeFile(name: string, type: string): File {
  return new File(["test"], name, { type });
}

function installBrowserMocks(): void {
  vi.stubGlobal("Image", MockImage);
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
  vi.stubGlobal("document", {
    createElement: vi.fn(() => ({
      width: 0,
      height: 0,
      getContext: () =>
        canvasContextAvailable
          ? ({ drawImage } as unknown as CanvasRenderingContext2D)
          : null,
      toDataURL: (mimeType: string, quality: number) => {
        if (canvasEncodeFails) throw new Error("Encoding failed.");
        toDataURL(mimeType, quality);
        return "data:image/jpeg;base64,thumbnail";
      },
    })),
  });
}

beforeEach(() => {
  imageWidth = 1600;
  imageHeight = 800;
  imageDecodeFails = false;
  canvasContextAvailable = true;
  canvasEncodeFails = false;
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  drawImage.mockClear();
  toDataURL.mockClear();
  installBrowserMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("calculateThumbnailSize", () => {
  it("preserves aspect ratio while reducing a landscape image", () => {
    expect(calculateThumbnailSize(1600, 800)).toEqual({ width: 400, height: 200 });
  });

  it("preserves aspect ratio for portrait images", () => {
    expect(calculateThumbnailSize(800, 1600)).toEqual({ width: 200, height: 400 });
  });

  it("does not upscale images smaller than the maximum", () => {
    expect(calculateThumbnailSize(120, 80)).toEqual({ width: 120, height: 80 });
  });

  it("supports a custom maximum dimension", () => {
    expect(calculateThumbnailSize(1200, 600, 240)).toEqual({ width: 240, height: 120 });
  });

  it("rejects invalid dimensions and bounds", () => {
    expect(() => calculateThumbnailSize(0, 100)).toThrow(RangeError);
    expect(() => calculateThumbnailSize(100, 100, 0)).toThrow(RangeError);
    expect(() => calculateThumbnailSize(100, 100, 4097)).toThrow(RangeError);
  });
});

describe("createBrowserThumbnail", () => {
  it("returns null for non-image files without creating an object URL", async () => {
    await expect(createBrowserThumbnail(makeFile("notes.txt", "text/plain"))).resolves.toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("does not override a known non-image extension with an image MIME type", async () => {
    await expect(createBrowserThumbnail(makeFile("notes.txt", "image/png"))).resolves.toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("accepts supported image extensions when MIME metadata is empty", async () => {
    await expect(createBrowserThumbnail(makeFile("poster.PNG", ""))).resolves.toBe(
      "data:image/jpeg;base64,thumbnail"
    );
  });

  it("accepts an image MIME type when the extension is unknown", async () => {
    await expect(createBrowserThumbnail(makeFile("asset.bin", "image/png"))).resolves.toBe(
      "data:image/jpeg;base64,thumbnail"
    );
  });

  it("uses deterministic bounded dimensions and the default JPEG quality", async () => {
    const result = await createBrowserThumbnail(makeFile("photo.jpg", "image/jpeg"));

    expect(result).toBe("data:image/jpeg;base64,thumbnail");
    expect(drawImage).toHaveBeenCalledWith(expect.any(MockImage), 0, 0, 400, 200);
    expect(toDataURL).toHaveBeenCalledWith("image/jpeg", 0.8);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test-thumbnail");
  });

  it("honors custom dimensions and quality", async () => {
    const result = await createBrowserThumbnail(makeFile("photo.jpg", "image/jpeg"), {
      maxDimension: 200,
      quality: 0.6,
    });

    expect(result).toBe("data:image/jpeg;base64,thumbnail");
    expect(drawImage).toHaveBeenCalledWith(expect.any(MockImage), 0, 0, 200, 100);
    expect(toDataURL).toHaveBeenCalledWith("image/jpeg", 0.6);
  });

  it("validates thumbnail options with RangeError", async () => {
    await expect(
      createBrowserThumbnail(makeFile("photo.jpg", "image/jpeg"), { maxDimension: 0 })
    ).rejects.toThrow(RangeError);
    await expect(
      createBrowserThumbnail(makeFile("photo.jpg", "image/jpeg"), { quality: 1.1 })
    ).rejects.toThrow(RangeError);
  });

  it("returns null and revokes the object URL when decoding fails", async () => {
    imageDecodeFails = true;

    await expect(createBrowserThumbnail(makeFile("broken.jpg", "image/jpeg"))).resolves.toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test-thumbnail");
  });

  it("returns null and revokes the object URL when the canvas is unavailable", async () => {
    canvasContextAvailable = false;

    await expect(createBrowserThumbnail(makeFile("photo.jpg", "image/jpeg"))).resolves.toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test-thumbnail");
  });

  it("returns null and revokes the object URL when encoding fails", async () => {
    canvasEncodeFails = true;

    await expect(createBrowserThumbnail(makeFile("photo.jpg", "image/jpeg"))).resolves.toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test-thumbnail");
  });
});
