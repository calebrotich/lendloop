/**
 * Browser-side photo preparation.
 *
 * Camera files are large and carry EXIF metadata, including GPS coordinates.
 * Every photo is decoded, resized to a sane longest edge and re-encoded before
 * it leaves the device. Re-encoding strips all metadata, which matters because
 * these images are served from a public host, and keeps the upload comfortably
 * under the server's 4 MB cap.
 *
 * The server does not trust this: it checks the stored content type, size and
 * magic bytes again. This module is a privacy/bandwidth layer, not a security
 * boundary.
 */

import { LIMITS } from "../convex/lib/limits";
import {
  IMAGE_CONTENT_TYPES,
  isImageContentType,
  type ImageContentType,
} from "../convex/lib/mediaConstants";

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
  contentType: ImageContentType;
}

/** HEIC/HEIF are source-only: browsers that can decode them re-encode to WebP/JPEG. */
const SOURCE_ONLY_MIME_TYPES = ["image/heic", "image/heif", "image/jpg"] as const;
const SOURCE_ONLY_EXTENSIONS = ["heic", "heif"] as const;

const ANY_IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "avif",
  ...SOURCE_ONLY_EXTENSIONS,
  "gif",
  "bmp",
  "tif",
  "tiff",
]);

function extensionOf(file: File): string | undefined {
  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension === undefined || extension.length === 0 ? undefined : extension;
}

function isHeic(file: File): boolean {
  const type = file.type.toLowerCase();
  return (
    type === "image/heic" || type === "image/heif" || /^(heic|heif)$/.test(extensionOf(file) ?? "")
  );
}

/**
 * A source file we are willing to try decoding. The server only ever stores the
 * re-encoded output, so the source format does not need to be on the server
 * allowlist — but SVG is rejected because it is an executable document.
 */
export function isSupportedSource(file: File): boolean {
  const type = file.type.toLowerCase();
  if (type === "image/svg+xml") return false;
  if (type.startsWith("image/")) return true;
  if ((SOURCE_ONLY_MIME_TYPES as readonly string[]).includes(type)) return true;
  const extension = extensionOf(file);
  return extension !== undefined && ANY_IMAGE_EXTENSIONS.has(extension);
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

async function encodeCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  let blob = await canvasToBlob(canvas, "image/webp", 0.82);
  if (blob !== null && blob.size > LIMITS.maxImageBytes) {
    blob = await canvasToBlob(canvas, "image/webp", 0.62);
  }
  if (blob === null) {
    // Some browsers cannot encode WebP. PNG is the spec fallback, but keep the
    // explicit attempt in case toBlob returned null instead.
    blob = await canvasToBlob(canvas, "image/png", 1);
  }
  if (blob !== null && blob.size <= LIMITS.maxImageBytes) return blob;

  // Last resort for very dense images: flatten to JPEG on a white background.
  const flat = document.createElement("canvas");
  flat.width = canvas.width;
  flat.height = canvas.height;
  const context = flat.getContext("2d");
  if (context === null) throw new Error("This browser can't prepare photos.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, flat.width, flat.height);
  context.drawImage(canvas, 0, 0);

  let jpeg = await canvasToBlob(flat, "image/jpeg", 0.85);
  if (jpeg !== null && jpeg.size > LIMITS.maxImageBytes) {
    jpeg = await canvasToBlob(flat, "image/jpeg", 0.6);
  }
  if (jpeg !== null && jpeg.size <= LIMITS.maxImageBytes) return jpeg;

  throw new Error("That photo is too detailed to upload. Try a smaller one.");
}

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

function decodeFailure(file: File): Error {
  return new Error(
    isHeic(file)
      ? "This browser can't read HEIC photos. In Photos, choose Export → JPEG, or use Safari."
      : "This image couldn't be decoded. Try exporting it as JPEG and uploading again.",
  );
}

/** Fallback for browsers without createImageBitmap (or files it cannot decode). */
function decodeWithImageElement(file: File): Promise<DecodedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    let settled = false;

    const release = () => URL.revokeObjectURL(url);

    image.onload = () => {
      if (settled) return;
      settled = true;
      if (image.naturalWidth < 1 || image.naturalHeight < 1) {
        release();
        reject(new Error("That image is empty."));
        return;
      }
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        release,
      });
    };

    image.onerror = () => {
      if (settled) return;
      settled = true;
      release();
      reject(decodeFailure(file));
    };

    image.src = url;
  });
}

async function decodeImage(file: File): Promise<DecodedImage> {
  // HEIC is decoded by Safari through an <img> element, while createImageBitmap
  // support varies by OS and browser. Try the element path first for HEIC so a
  // stuck decode cannot hold the upload open.
  if (isHeic(file)) {
    try {
      return await decodeWithImageElement(file);
    } catch {
      // Fall through to createImageBitmap; some builds support it instead.
    }
  }

  if (typeof createImageBitmap === "function") {
    try {
      // Respect the camera's EXIF orientation before the metadata is stripped.
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      try {
        // Older browsers reject the options object rather than ignoring it.
        const bitmap = await createImageBitmap(file);
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          release: () => bitmap.close(),
        };
      } catch {
        // Fall through to an <img> decode, which handles browsers where
        // createImageBitmap is missing or limited.
      }
    }
  }

  if (!isHeic(file)) {
    try {
      return await decodeWithImageElement(file);
    } catch (error) {
      throw error instanceof Error && error.message === "That image is empty."
        ? error
        : decodeFailure(file);
    }
  }

  throw decodeFailure(file);
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!isSupportedSource(file)) {
    throw new Error("Use a JPEG, PNG, WebP, AVIF or HEIC image. SVG isn't supported.");
  }
  if (file.size > LIMITS.maxSourceImageBytes) {
    throw new Error(
      `That file is over ${Math.floor(LIMITS.maxSourceImageBytes / 1024 / 1024)} MB. Try a smaller photo.`,
    );
  }

  const decoded = await decodeImage(file);

  try {
    if (decoded.width < 1 || decoded.height < 1) {
      throw new Error("That image is empty.");
    }

    const scale = Math.min(1, LIMITS.maxImageDimension / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (context === null) {
      throw new Error("This browser can't prepare photos. Try another browser.");
    }
    context.drawImage(decoded.source, 0, 0, width, height);

    const blob = await encodeCanvas(canvas);
    const contentType = blob.type.toLowerCase();
    if (!isImageContentType(contentType)) {
      throw new Error("This browser produced an unsupported image format.");
    }

    return { blob, width, height, contentType };
  } finally {
    decoded.release();
  }
}

/** Display copy for the accepted source formats; HEIC is decoded where supported. */
export const ACCEPTED_IMAGE_TYPES = [
  ...IMAGE_CONTENT_TYPES,
  "image/heic",
  "image/heif",
  ".heic",
  ".heif",
].join(",");
