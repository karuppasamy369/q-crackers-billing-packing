/**
 * Server-side validation for PDF uploads (LR / parcel-booking documents).
 *
 * As with images, we check the actual file bytes — not the browser-supplied
 * Content-Type or filename — and enforce a byte-size cap. A PDF starts with
 * `%PDF-` and a well-formed one ends with an `%%EOF` marker near the tail.
 */
export type PdfCheck = { ok: true } | { ok: false; error: string };

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
const EOF_MARKER = [0x25, 0x25, 0x45, 0x4f, 0x46]; // "%%EOF"

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (bytes[offset + i] !== sig[i]) return false;
  }
  return true;
}

function containsMarker(bytes: Uint8Array, sig: number[], tailBytes: number) {
  const start = Math.max(0, bytes.length - tailBytes);
  for (let i = bytes.length - sig.length; i >= start; i--) {
    let match = true;
    for (let j = 0; j < sig.length; j++) {
      if (bytes[i + j] !== sig[j]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

export function validatePdfUpload(
  bytes: Uint8Array,
  maxBytes: number,
): PdfCheck {
  if (bytes.length === 0) return { ok: false, error: "The file is empty." };
  if (bytes.length > maxBytes) {
    const mb = (maxBytes / (1024 * 1024)).toFixed(1);
    return { ok: false, error: `The PDF must be ${mb} MB or smaller.` };
  }
  if (!startsWith(bytes, PDF_MAGIC)) {
    return { ok: false, error: "That file is not a PDF. Upload a PDF file." };
  }
  // Trailer can be followed by whitespace/newlines; scan the last 2 KB.
  if (!containsMarker(bytes, EOF_MARKER, 2048)) {
    return {
      ok: false,
      error: "The PDF looks incomplete or corrupted. Try re-saving it.",
    };
  }
  return { ok: true };
}
