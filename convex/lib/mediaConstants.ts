/**
 * Shared image rules for the browser and the Convex runtime.
 *
 * Deliberately free of Convex imports (like `limits.ts`) so the upload UI can
 * enforce the same allowlist the server enforces. SVG is excluded on purpose:
 * it is an executable document, and these files are served from a public host.
 */

export const IMAGE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;

export type ImageContentType = (typeof IMAGE_CONTENT_TYPES)[number];

export const IMAGE_EXTENSIONS: Record<ImageContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

/**
 * Object keys are random and never reused, so the bytes behind a URL cannot
 * change. A one-day TTL keeps repeat views off the origin without making a
 * deleted photo linger in edge caches indefinitely: R2 removes the object
 * immediately, and the CDN copy expires within a day. (`immutable` is
 * deliberately not used — there is no cache purge on delete.)
 */
export const IMAGE_CACHE_CONTROL = "public, max-age=86400";

export function isImageContentType(value: string): value is ImageContentType {
  return (IMAGE_CONTENT_TYPES as readonly string[]).includes(value);
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let text = "";
  for (let index = start; index < start + length; index += 1) {
    const byte = bytes[index];
    if (byte === undefined) return "";
    text += String.fromCharCode(byte);
  }
  return text;
}

/**
 * Server-side sniff of the first bytes of an object.
 *
 * A client controls the `Content-Type` it claims, so the uploaded bytes are
 * checked against the declared image family before the object is accepted. It
 * is not a full decoder, but it stops an HTML/script payload labelled as a
 * photo from being stored and served.
 */
export function hasImageSignature(contentType: string, bytes: Uint8Array): boolean {
  switch (contentType) {
    case "image/jpeg":
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "image/png":
      return (
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
      );
    case "image/webp":
      return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP";
    case "image/avif": {
      if (ascii(bytes, 4, 4) !== "ftyp") return false;
      // Major brand, plus the common compatible brands produced by encoders.
      const brand = ascii(bytes, 8, 4);
      return brand === "avif" || brand === "avis" || brand === "mif1" || brand === "msf1";
    }
    default:
      return false;
  }
}
