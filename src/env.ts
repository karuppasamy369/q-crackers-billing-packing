import { z } from "zod";

/**
 * Central, validated environment access.
 *
 * Import `env` from here instead of reading `process.env` directly so that a
 * misconfigured deployment fails fast and loudly at startup rather than
 * surfacing as a confusing runtime error later.
 */
const runtimeSchema = z.object({
  NODE_ENV: z
    .enum(["development", "staging", "production", "test"])
    .default("development"),

  NEXT_PUBLIC_APP_URL: z.string().min(1).default("http://localhost:3000"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_URL: z.string().min(1).optional(),

  SESSION_IDLE_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(480),
  SESSION_ABSOLUTE_TIMEOUT_HOURS: z.coerce
    .number()
    .int()
    .positive()
    .default(168),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),

  // --- Object storage (product images, LR / parcel PDFs) ----------------
  // "filesystem" keeps files in a local, non-public directory for dev.
  // "supabase" uses a PRIVATE Supabase Storage bucket in staging/production.
  STORAGE_DRIVER: z.enum(["filesystem", "supabase"]).default("filesystem"),
  STORAGE_FS_DIR: z.string().min(1).default(".storage"),
  STORAGE_MAX_IMAGE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(5 * 1024 * 1024),
  // Upload cap for LR / parcel-booking PDFs (Phase 6 booking panel).
  STORAGE_MAX_DOCUMENT_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024),
  SUPABASE_URL: z.string().min(1).optional(),
  // Service-role key — SERVER ONLY. Never prefixed NEXT_PUBLIC, never sent to
  // the browser.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default("qc-media"),

  // --- Scheduled jobs -----------------------------------------------------
  // Bearer secret for /api/cron/* routes (expired stock-hold release,
  // notification delivery). When unset, the cron routes return 503 (disabled).
  CRON_SECRET: z.string().min(16).optional(),

  // --- Customer tracking links ------------------------------------------
  // HMAC key the tracking token is derived from. Set an explicit 32+ char
  // value in staging/production so links survive a DATABASE_URL change and can
  // be rotated deliberately; when unset, a stable value is derived from
  // DATABASE_URL. SERVER ONLY — never NEXT_PUBLIC.
  TRACKING_LINK_SECRET: z.string().min(32).optional(),

  // --- WhatsApp notifications (Phase 8) --------------------------------
  // "none" (default) = notifications are recorded but not sent — the app works
  // normally. "log" = write the message to the server log (dev). "meta" = the
  // real WhatsApp Business Cloud API.
  WHATSAPP_PROVIDER: z.enum(["none", "log", "meta"]).default("none"),
  // Required only when WHATSAPP_PROVIDER=meta. SERVER ONLY — never NEXT_PUBLIC.
  WHATSAPP_ACCESS_TOKEN: z.string().min(1).optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1).optional(),
  WHATSAPP_API_VERSION: z.string().min(2).default("v21.0"),
  // Delivery attempts before a message is marked permanently failed (DEAD).
  WHATSAPP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),

  // --- Cashfree automatic UPI verification (Phase 10) --------------------
  // Applies to every partner who has onboarded (PartnerPaymentAccount.
  // pspProvider = "CASHFREE"). A partner's own App ID / Secret Key are NOT
  // here — they live in CASHFREE_APP_ID_<CODE> / CASHFREE_SECRET_KEY_<CODE>,
  // read lazily per partner (see cashfree.ts) since the set of partner codes
  // is data, not something this static schema can enumerate. SERVER ONLY.
  CASHFREE_ENV: z.enum(["SANDBOX", "PRODUCTION"]).default("SANDBOX"),
  CASHFREE_API_VERSION: z.string().min(1).default("2023-08-01"),
});

type Env = z.infer<typeof runtimeSchema>;

// The database URL is not needed to compile the app, only to run it.
const isBuildPhase =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.SKIP_ENV_VALIDATION === "1";

function loadEnv(): Env {
  const source = { ...process.env };
  if (isBuildPhase && !source.DATABASE_URL) {
    source.DATABASE_URL = "postgresql://build:build@localhost:5432/build";
  }

  const parsed = runtimeSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  if (
    !isBuildPhase &&
    parsed.data.STORAGE_DRIVER === "supabase" &&
    (!parsed.data.SUPABASE_URL || !parsed.data.SUPABASE_SERVICE_ROLE_KEY)
  ) {
    throw new Error(
      "STORAGE_DRIVER=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  if (
    !isBuildPhase &&
    parsed.data.WHATSAPP_PROVIDER === "meta" &&
    (!parsed.data.WHATSAPP_ACCESS_TOKEN ||
      !parsed.data.WHATSAPP_PHONE_NUMBER_ID)
  ) {
    throw new Error(
      "WHATSAPP_PROVIDER=meta requires WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.",
    );
  }

  return parsed.data;
}

export const env: Env = loadEnv();

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
