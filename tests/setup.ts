// Vitest global setup.
// Provide deterministic env defaults so modules that read `@/env` load cleanly
// without a real .env during unit tests. (Vitest already sets NODE_ENV=test.)
process.env.SKIP_ENV_VALIDATION = "1";
process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";

// Integration tests target a dedicated database. When TEST_DATABASE_URL is
// set, point the app's Prisma client at it too.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DIRECT_URL = process.env.TEST_DATABASE_URL;
} else {
  process.env.DATABASE_URL ??=
    "postgresql://test:test@localhost:5432/test?schema=public";
}
