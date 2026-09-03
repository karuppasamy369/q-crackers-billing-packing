/**
 * Object storage abstraction.
 *
 * Product images (this phase) and LR PDFs (Phase 8) are stored in a PRIVATE
 * bucket. Nothing is ever served straight from the storage provider to the
 * browser — the app streams bytes through an authorised route handler, or (for
 * providers that support it) mints a short-lived signed URL server-side. The
 * storage credentials never leave the server.
 */
export type StorageObject = {
  data: Uint8Array;
  contentType: string;
};

export interface StorageProvider {
  readonly name: string;

  /** Create or overwrite an object. */
  put(key: string, data: Uint8Array, contentType: string): Promise<void>;

  /** Fetch an object, or null if it does not exist. */
  get(key: string): Promise<StorageObject | null>;

  /** Delete an object. No error if it is already gone. */
  delete(key: string): Promise<void>;

  exists(key: string): Promise<boolean>;

  /**
   * A short-lived signed URL, if the provider supports one. Returns null when
   * the caller should stream the object through the app instead.
   */
  signedUrl(key: string, expiresInSeconds: number): Promise<string | null>;
}
