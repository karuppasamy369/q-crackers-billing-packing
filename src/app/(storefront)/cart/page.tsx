import type { Metadata } from "next";
import { getStorefrontContext } from "@/server/storefront/context";
import { CartView } from "./cart-view";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getStorefrontContext();
  return { title: t.cart.title };
}

export default async function CartPage() {
  const { t } = await getStorefrontContext();
  return <CartView t={t} />;
}
