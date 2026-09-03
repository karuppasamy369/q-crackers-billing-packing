import { describe, it, expect } from "vitest";
import { sniffImage, validateImageUpload } from "./image-validation";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const png = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0,
]);
const webp = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
]);
const bogus = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"

describe("sniffImage", () => {
  it("recognises JPEG, PNG and WebP by magic bytes", () => {
    expect(sniffImage(jpeg)).toMatchObject({
      ok: true,
      contentType: "image/jpeg",
    });
    expect(sniffImage(png)).toMatchObject({
      ok: true,
      contentType: "image/png",
    });
    expect(sniffImage(webp)).toMatchObject({
      ok: true,
      contentType: "image/webp",
    });
  });

  it("rejects anything else (e.g. a PDF renamed to .jpg)", () => {
    expect(sniffImage(bogus).ok).toBe(false);
  });
});

describe("validateImageUpload", () => {
  it("rejects empty and oversized files", () => {
    expect(validateImageUpload(new Uint8Array(), 1000).ok).toBe(false);
    expect(validateImageUpload(new Uint8Array(2000), 1000).ok).toBe(false);
  });

  it("accepts a valid image within the size cap", () => {
    expect(validateImageUpload(png, 1000)).toMatchObject({ ok: true });
  });

  it("does not trust content-type — only the bytes matter", () => {
    // caller cannot pass a content-type; a disguised file still fails
    expect(validateImageUpload(bogus, 1000).ok).toBe(false);
  });
});
