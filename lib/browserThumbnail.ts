const DEFAULT_MAX_DIMENSION = 400;
const DEFAULT_QUALITY = 0.8;
const MAX_ALLOWED_DIMENSION = 4096;

const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  "bmp",
  "gif",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "tif",
  "tiff",
  "webp",
]);

const KNOWN_NON_IMAGE_EXTENSIONS = new Set([
  "csv",
  "doc",
  "docx",
  "html",
  "htm",
  "json",
  "markdown",
  "md",
  "pdf",
  "txt",
]);

export interface BrowserThumbnailOptions {
  maxDimension?: number;
  quality?: number;
}

function validateDimension(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1 || value > MAX_ALLOWED_DIMENSION) {
    throw new RangeError(`${name} must be an integer between 1 and ${MAX_ALLOWED_DIMENSION}.`);
  }
}

function validateQuality(value: number): void {
  if (!Number.isFinite(value) || value < 0.1 || value > 1) {
    throw new RangeError("quality must be a number between 0.1 and 1.");
  }
}

/** Calculate a proportional size that never exceeds the source dimensions. */
export function calculateThumbnailSize(
  width: number,
  height: number,
  maxDimension = DEFAULT_MAX_DIMENSION
): { width: number; height: number } {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new RangeError("width and height must be finite positive numbers.");
  }
  validateDimension(maxDimension, "maxDimension");

  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function extensionOf(filename: string): string {
  const extension = filename.toLowerCase().split(".").pop();
  return extension && extension !== filename.toLowerCase() ? extension : "";
}

function isImageFile(file: File): boolean {
  const extension = extensionOf(file.name);
  if (SUPPORTED_IMAGE_EXTENSIONS.has(extension)) return true;
  if (KNOWN_NON_IMAGE_EXTENSIONS.has(extension)) return false;
  return file.type.toLowerCase().startsWith("image/");
}

function readOptions(options: BrowserThumbnailOptions | undefined): {
  maxDimension: number;
  quality: number;
} {
  const maxDimension = options?.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const quality = options?.quality ?? DEFAULT_QUALITY;
  validateDimension(maxDimension, "maxDimension");
  validateQuality(quality);
  return { maxDimension, quality };
}

/**
 * Create a bounded, aspect-preserving JPEG preview entirely in the browser.
 * The returned data URL is safe to attach to the persisted client session.
 */
export async function createBrowserThumbnail(
  file: File,
  options?: Readonly<BrowserThumbnailOptions>
): Promise<string | null> {
  const { maxDimension, quality } = readOptions(options);
  if (!isImageFile(file)) return null;

  let objectUrl: string | null = null;
  try {
    objectUrl = URL.createObjectURL(file);
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Image decoding failed."));
      element.src = objectUrl as string;
    });

    const size = calculateThumbnailSize(image.naturalWidth, image.naturalHeight, maxDimension);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;

    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, 0, 0, size.width, size.height);

    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    return dataUrl.startsWith("data:image/jpeg") ? dataUrl : null;
  } catch {
    return null;
  } finally {
    if (objectUrl) {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // Object URL cleanup must not turn an unavailable preview into an error.
      }
    }
  }
}
