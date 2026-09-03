import type { Metadata } from "next";
import { getStorefrontContext } from "@/server/storefront/context";
import { CheckoutForm } from "./checkout-form";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getStorefrontContext();
  return { title: t.checkout.title, robots: { index: false } };
}

export default async function CheckoutPage() {
  const { t } = await getStorefrontContext();
  return <CheckoutForm t={t} />;
}
