import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { getPublicSettings } from "@/server/services/settings-service";
import {
  LOCALE_COOKIE,
  resolveLocale,
  getDictionary,
  type Dictionary,
  type Locale,
} from "@/lib/i18n";
import type { PublicSettingsSnapshot } from "@/lib/settings/registry";

export type StorefrontContext = {
  locale: Locale;
  settings: PublicSettingsSnapshot;
  t: Dictionary;
};

/** Locale + public settings + dictionary for the current request. */
export const getStorefrontContext = cache(
  async (): Promise<StorefrontContext> => {
    const settings = await getPublicSettings();
    const cookieStore = await cookies();
    const locale = resolveLocale({
      cookieValue: cookieStore.get(LOCALE_COOKIE)?.value,
      enabled: settings["storefront.enabledLocales"],
      fallback: settings["storefront.defaultLocale"],
    });
    return { locale, settings, t: getDictionary(locale) };
  },
);
