import "server-only";

import { env } from "@/env";
import type { StorageProvider } from "./types";
import { FilesystemStorage } from "./filesystem";
import { SupabaseStorage } from "./supabase";

export type { StorageProvider, StorageObject } from "./types";

let instance: StorageProvider | undefined;

/** The configured storage provider (singleton). */
export function getStorage(): StorageProvider {
  if (instance) return instance;

  if (env.STORAGE_DRIVER === "supabase") {
    instance = new SupabaseStorage({
      url: env.SUPABASE_URL!,
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY!,
      bucket: env.SUPABASE_STORAGE_BUCKET,
    });
  } else {
    instance = new FilesystemStorage(env.STORAGE_FS_DIR);
  }
  return instance;
}

/** Media key prefixes. Keys are `<prefix>/<uuid>.<ext>` — unguessable. */
export const MEDIA_PREFIX = {
  productImage: "product-images",
  categoryImage: "category-images",
} as const;
