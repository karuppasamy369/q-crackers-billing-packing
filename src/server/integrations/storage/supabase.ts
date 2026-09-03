import "server-only";

import type { StorageProvider, StorageObject } from "./types";

/**
 * Supabase Storage adapter over the REST API (no SDK dependency, keeps the
 * app portable). The bucket MUST be created as private. The service-role key
 * is server-only.
 */
export class SupabaseStorage implements StorageProvider {
  readonly name = "supabase";
  private readonly base: string;
  private readonly bucket: string;
  private readonly key: string;

  constructor(opts: { url: string; serviceRoleKey: string; bucket: string }) {
    this.base = `${opts.url.replace(/\/$/, "")}/storage/v1`;
    this.bucket = opts.bucket;
    this.key = opts.serviceRoleKey;
  }

  private headers(extra?: Record<string, string>) {
    return {
      Authorization: `Bearer ${this.key}`,
      apikey: this.key,
      ...extra,
    };
  }

  private objectUrl(key: string) {
    return `${this.base}/object/${this.bucket}/${encodeURI(key)}`;
  }

  async put(key: string, data: Uint8Array, contentType: string): Promise<void> {
    const res = await fetch(this.objectUrl(key), {
      method: "POST",
      headers: this.headers({
        "Content-Type": contentType,
        "x-upsert": "true",
        "cache-control": "3600",
      }),
      body: data as unknown as BodyInit,
    });
    if (!res.ok) {
      throw new Error(
        `Supabase storage upload failed (${res.status}): ${await safeText(res)}`,
      );
    }
  }

  async get(key: string): Promise<StorageObject | null> {
    const res = await fetch(this.objectUrl(key), { headers: this.headers() });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Supabase storage download failed (${res.status}).`);
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    return {
      data: buf,
      contentType:
        res.headers.get("content-type") ?? "application/octet-stream",
    };
  }

  async delete(key: string): Promise<void> {
    const res = await fetch(this.objectUrl(key), {
      method: "DELETE",
      headers: this.headers(),
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`Supabase storage delete failed (${res.status}).`);
    }
  }

  async exists(key: string): Promise<boolean> {
    const res = await fetch(this.objectUrl(key), {
      method: "HEAD",
      headers: this.headers(),
    });
    return res.ok;
  }

  async signedUrl(
    key: string,
    expiresInSeconds: number,
  ): Promise<string | null> {
    const res = await fetch(
      `${this.base}/object/sign/${this.bucket}/${encodeURI(key)}`,
      {
        method: "POST",
        headers: this.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ expiresIn: expiresInSeconds }),
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { signedURL?: string };
    if (!json.signedURL) return null;
    return `${this.base}${json.signedURL.startsWith("/") ? "" : "/"}${json.signedURL}`;
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "";
  }
}
