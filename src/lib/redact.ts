const SENSITIVE_KEYS = new Set([
  "password",
  "newpassword",
  "currentpassword",
  "confirmpassword",
  "passwordhash",
  "token",
  "rawtoken",
  "tokenhash",
  "totpsecret",
  "secret",
  "authorization",
  "cookie",
  "accesstoken",
  "access_token",
  "apikey",
  "api_key",
  "bearer",
  "whatsapp_access_token",
]);

/**
 * Recursively replace anything that looks like a credential with "[redacted]".
 * Used before writing structured data to the audit log or the app logger.
 */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? "[redacted]" : redact(v);
    }
    return out;
  }
  return value;
}
