import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import type { StorageProvider, StorageObject } from "./types";

const CONTENT_TYPE_SIDECAR = ".contenttype";

/**
 * Local-disk storage for development. Files live under a non-public directory
 * (default `.storage/`, git-ignored) and are only ever served through the
 * app's authorised media route — there is no web server mapping to this
 * folder.
 */
export class FilesystemStorage implements StorageProvider {
  readonly name = "filesystem";
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = path.resolve(process.cwd(), rootDir);
  }

  private resolve(key: string): string {
    // Keys are app-generated (random UUID + extension), but defend anyway.
    const clean = key.replace(/\\/g, "/");
    if (clean.includes("..") || clean.startsWith("/")) {
      throw new Error("Invalid storage key.");
    }
    const full = path.resolve(this.root, clean);
    if (full !== this.root && !full.startsWith(this.root + path.sep)) {
      throw new Error("Storage key escapes the storage root.");
    }
    return full;
  }

  async put(key: string, data: Uint8Array, contentType: string): Promise<void> {
    const file = this.resolve(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, data);
    await fs.writeFile(file + CONTENT_TYPE_SIDECAR, contentType, "utf8");
  }

  async get(key: string): Promise<StorageObject | null> {
    const file = this.resolve(key);
    try {
      const data = await fs.readFile(file);
      let contentType = "application/octet-stream";
      try {
        contentType = (
          await fs.readFile(file + CONTENT_TYPE_SIDECAR, "utf8")
        ).trim();
      } catch {
        // sidecar missing — fall back to the default
      }
      return { data: new Uint8Array(data), contentType };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    const file = this.resolve(key);
    await fs.rm(file, { force: true });
    await fs.rm(file + CONTENT_TYPE_SIDECAR, { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async signedUrl(): Promise<string | null> {
    // No direct URL — the app streams the bytes through its media route.
    return null;
  }
}
