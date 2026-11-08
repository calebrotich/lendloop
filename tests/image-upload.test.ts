import { describe, expect, it } from "vitest";

import { isSupportedSource } from "../lib/image-upload";

function file(name: string, type: string): File {
  return new File([new Uint8Array([1])], name, { type });
}

describe("isSupportedSource", () => {
  it("accepts the server formats and HEIC/HEIF sources", () => {
    expect(isSupportedSource(file("photo.jpg", "image/jpeg"))).toBe(true);
    expect(isSupportedSource(file("photo.png", "image/png"))).toBe(true);
    expect(isSupportedSource(file("photo.webp", "image/webp"))).toBe(true);
    expect(isSupportedSource(file("photo.avif", "image/avif"))).toBe(true);
    expect(isSupportedSource(file("IMG_0001.HEIC", "image/heic"))).toBe(true);
    expect(isSupportedSource(file("IMG_0002.heif", ""))).toBe(true);
  });

  it("accepts a camera file whose MIME type is missing", () => {
    expect(isSupportedSource(file("photo.jpeg", ""))).toBe(true);
  });

  it("rejects SVG and non-images", () => {
    expect(isSupportedSource(file("drawing.svg", "image/svg+xml"))).toBe(false);
    expect(isSupportedSource(file("notes.txt", "text/plain"))).toBe(false);
  });
});
