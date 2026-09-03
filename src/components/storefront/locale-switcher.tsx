import { getDictionary, type Locale } from "@/lib/i18n";
import { setLocaleAction } from "@/app/(storefront)/actions";

/**
 * Language switcher. Server-rendered <form>s so it works without JavaScript;
 * the selected locale is stored in a cookie.
 */
export function LocaleSwitcher({
  current,
  enabled,
  back,
}: {
  current: Locale;
  enabled: readonly Locale[];
  back: string;
}) {
  if (enabled.length < 2) return null;

  return (
    <div className="flex items-center gap-1 text-xs">
      {enabled.map((loc) => (
        <form key={loc} action={setLocaleAction}>
          <input type="hidden" name="locale" value={loc} />
          <input type="hidden" name="back" value={back} />
          <button
            type="submit"
            aria-current={loc === current ? "true" : undefined}
            className={
              loc === current
                ? "rounded bg-gray-900 px-2 py-1 text-white"
                : "rounded px-2 py-1 text-gray-600 hover:bg-gray-100"
            }
          >
            {getDictionary(loc).localeName}
          </button>
        </form>
      ))}
    </div>
  );
}
