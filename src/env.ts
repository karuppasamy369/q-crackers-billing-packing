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
  if (parsed.success) return parsed.data;

  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env: Env = loadEnv();

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
