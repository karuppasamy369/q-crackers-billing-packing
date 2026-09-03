/**
 * Server-side image validation for uploads. We check the actual file bytes
 * (magic numbers), not the browser-supplied Content-Type or filename, and we
 * enforce a byte-size cap.
 */
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export type ImageCheck =
  | {
      ok: true;
      contentType: AllowedImageType;
      extension: "jpg" | "png" | "webp";
    }
  | { ok: false; error: string };

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (bytes[offset + i] !== sig[i]) return false;
  }
  return true;
}

export function sniffImage(bytes: Uint8Array): ImageCheck {
  // JPEG: FF D8 FF
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { ok: true, contentType: "image/jpeg", extension: "jpg" };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { ok: true, contentType: "image/png", extension: "png" };
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return { ok: true, contentType: "image/webp", extension: "webp" };
  }
  return {
    ok: false,
    error: "Unsupported image format. Use JPEG, PNG, or WebP.",
  };
}

export function validateImageUpload(
  bytes: Uint8Array,
  maxBytes: number,
): ImageCheck {
  if (bytes.length === 0) return { ok: false, error: "The file is empty." };
  if (bytes.length > maxBytes) {
    const mb = (maxBytes / (1024 * 1024)).toFixed(1);
    return { ok: false, error: `Image must be ${mb} MB or smaller.` };
  }
  return sniffImage(bytes);
}
