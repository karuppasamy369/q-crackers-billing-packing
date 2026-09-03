import { isProduction } from "@/env";

/**
 * Minimal structured logger. In production it emits single-line JSON so a log
 * aggregator (or Vercel/Sentry) can parse it; in development it stays readable.
 *
 * Never log secrets, password hashes, raw session tokens, or full request
 * bodies. Callers are responsible for redaction before passing data here.
 */
type Level = "debug" | "info" | "warn" | "error";

type Fields = Record<string, unknown>;

function emit(level: Level, message: string, fields?: Fields) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...fields,
  };

  if (isProduction) {
    // eslint-disable-next-line no-console
    console[level === "debug" ? "info" : level](JSON.stringify(entry));
    return;
  }

  const suffix = fields && Object.keys(fields).length ? fields : "";
  // eslint-disable-next-line no-console
  console[level === "debug" ? "info" : level](`[${level}] ${message}`, suffix);
}

export const logger = {
  debug: (m: string, f?: Fields) => emit("debug", m, f),
  info: (m: string, f?: Fields) => emit("info", m, f),
  warn: (m: string, f?: Fields) => emit("warn", m, f),
  error: (m: string, f?: Fields) => emit("error", m, f),
};
