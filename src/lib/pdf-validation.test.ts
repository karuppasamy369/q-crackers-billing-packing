import { describe, it, expect } from "vitest";
import { validatePdfUpload } from "./pdf-validation";

const enc = (s: string) => new TextEncoder().encode(s);

/** A minimal byte sequence that passes the magic + EOF checks. */
function fakePdf(body = "1 0 obj\n<<>>\nendobj\n"): Uint8Array {
  return enc(`%PDF-1.4\n${body}\n%%EOF\n`);
}

describe("validatePdfUpload", () => {
  it("accepts a well-formed PDF within the size cap", () => {
    expect(validatePdfUpload(fakePdf(), 10 * 1024 * 1024)).toEqual({
      ok: true,
    });
  });

  it("rejects an empty file", () => {
    expect(validatePdfUpload(new Uint8Array(), 1024).ok).toBe(false);
  });

  it("rejects a file over the size cap", () => {
    const big = new Uint8Array(2048);
    big.set(enc("%PDF-"), 0);
    const res = validatePdfUpload(big, 1024);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/smaller/);
  });

  it("rejects a non-PDF (wrong magic bytes)", () => {
    const res = validatePdfUpload(enc("PK zip not pdf %%EOF"), 1024);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not a PDF/);
  });

  it("rejects a PDF with no EOF marker (truncated)", () => {
    const res = validatePdfUpload(
      enc("%PDF-1.4\nsome content but cut off"),
      1024,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/incomplete|corrupted/);
  });
});
