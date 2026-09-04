import "server-only";

import QRCode from "qrcode";

/**
 * Render a string to a PNG data URI. Used for UPI payment QRs and partner
 * order-link QRs — small enough to inline in a server-rendered page.
 */
export async function renderQrDataUri(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
  });
}

/** Render to raw PNG bytes (for a download route). */
export async function renderQrPng(text: string): Promise<Uint8Array> {
  const buf = await QRCode.toBuffer(text, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 512,
  });
  return new Uint8Array(buf);
}
