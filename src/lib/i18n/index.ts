import { LOCALES, type Locale } from "@/lib/settings/registry";

export const LOCALE_COOKIE = "qc_locale";

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

/**
 * Pick the active locale from an explicit cookie value, falling back to the
 * configured default. `enabled` / `fallback` come from public settings so the
 * storefront never renders a language a partner has switched off.
 */
export function resolveLocale(opts: {
  cookieValue?: string | null;
  enabled: readonly string[];
  fallback: string;
}): Locale {
  const enabled = opts.enabled.filter(isLocale);
  const firstEnabled: Locale = enabled[0] ?? "en";

  if (isLocale(opts.cookieValue) && enabled.includes(opts.cookieValue)) {
    return opts.cookieValue;
  }
  if (isLocale(opts.fallback) && enabled.includes(opts.fallback)) {
    return opts.fallback;
  }
  return firstEnabled;
}

export { LOCALES, type Locale };
export { getDictionary, type Dictionary } from "./dictionaries";
