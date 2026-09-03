import Link from "next/link";
import type { Metadata } from "next";

import { getStorefrontContext } from "@/server/storefront/context";
import { listPublicCategories } from "@/server/services/storefront-service";
import { currentPathname } from "@/server/http/pathname";
import { LocaleSwitcher } from "@/components/storefront/locale-switcher";
import type { Locale } from "@/lib/i18n";

// The storefront reads the visitor's locale cookie and shows the live
// catalogue, so it is always rendered per-request. (ISR/caching can be layered
// on in a later performance pass.)
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getStorefrontContext();
  return {
    title: { default: t.siteName, template: `%s · ${t.siteName}` },
    description: t.tagline,
  };
}

export default async function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { locale, settings, t } = await getStorefrontContext();
  const [categories, pathname] = await Promise.all([
    listPublicCategories(),
    currentPathname(),
  ]);
  const enabled = settings["storefront.enabledLocales"] as Locale[];
  const announcement = settings["storefront.announcement"];
  const notice = settings["fulfilment.restrictionNotice"];

  return (
    <div lang={locale} className="flex min-h-screen flex-col bg-white">
      {announcement ? (
        <div className="bg-gray-900 px-4 py-2 text-center text-xs text-white">
          {announcement}
        </div>
      ) : null}

      <header className="border-b border-gray-200">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link href="/" className="text-lg font-semibold">
            {t.siteName}
          </Link>
          <div className="flex items-center gap-4">
            <LocaleSwitcher
              current={locale}
              enabled={enabled}
              back={pathname}
            />
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl flex-wrap gap-x-4 gap-y-1 px-4 pb-3 text-sm">
          <Link href="/" className="text-gray-700 hover:underline">
            {t.nav.allProducts}
          </Link>
          {categories.map((c) => (
            <Link
              key={c.slug}
              href={`/?category=${encodeURIComponent(c.slug)}`}
              className="text-gray-500 hover:underline"
            >
              {c.name}
            </Link>
          ))}
        </nav>
      </header>

      {notice ? (
        <p className="mx-auto w-full max-w-5xl px-4 pt-3 text-xs text-amber-700">
          {notice}
        </p>
      ) : null}

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {children}
      </main>

      <footer className="border-t border-gray-200">
        <div className="mx-auto flex max-w-5xl flex-col gap-1 px-4 py-6 text-xs text-gray-500 sm:flex-row sm:justify-between">
          <span>
            © {new Date().getFullYear()} {t.siteName}. {t.footer.rights}
          </span>
          <span className="flex gap-3">
            {settings["business.phone"] ? (
              <span>
                {t.footer.contact}: {settings["business.phone"]}
              </span>
            ) : null}
            <Link href="/login" className="hover:underline">
              Staff sign in
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
