import "server-only";

import { db } from "@/server/db";
import { getEffectiveSettings } from "@/server/services/settings-service";
import { cartSchema, type CartItemInput } from "@/lib/validation/checkout";
import { computeOrderTotals } from "@/lib/pricing";

export type QuoteIssue = {
  slug: string;
  name?: string;
  code: "unavailable" | "insufficient_stock" | "below_minimum" | "invalid";
  message: string;
  available?: number;
};

export type QuoteLine = {
  productId: string;
  sku: string;
  slug: string;
  name: string;
  primaryImageId: string | null;
  quantity: number;
  available: number;
  unitPricePaise: number;
  gstRateBp: number;
  lineSubtotalPaise: number;
  lineTaxPaise: number;
  lineTotalPaise: number;
};

export type CartQuote = {
  lines: QuoteLine[];
  issues: QuoteIssue[];
  subtotalPaise: number;
  taxPaise: number;
  shippingPaise: number;
  totalPaise: number;
  pricesIncludeGst: boolean;
  minOrderValuePaise: number;
  currency: "INR";
  fulfillable: boolean;
};

/**
 * Server-authoritative cart quote. The client only ever sends
 * `{ productId, quantity }` pairs — every price, tax and total here is computed
 * from the current database + settings. Used by both the cart page and
 * checkout so they can never disagree.
 */
export async function quoteCart(rawItems: CartItemInput[]): Promise<CartQuote> {
  const settings = await getEffectiveSettings();
  const pricesIncludeGst = settings["tax.pricesIncludeGst"];
  const minOrderValuePaise = settings["checkout.minOrderValuePaise"];

  const parsed = cartSchema.safeParse(rawItems);
  const emptyQuote = (issues: QuoteIssue[]): CartQuote => ({
    lines: [],
    issues,
    subtotalPaise: 0,
    taxPaise: 0,
    shippingPaise: 0,
    totalPaise: 0,
    pricesIncludeGst,
    minOrderValuePaise,
    currency: "INR",
    fulfillable: false,
  });

  if (!parsed.success) {
    return emptyQuote([
      {
        slug: "",
        code: "invalid",
        message: parsed.error.issues[0]?.message ?? "Invalid cart.",
      },
    ]);
  }
  const items = parsed.data;

  const products = await db.product.findMany({
    where: { slug: { in: items.map((i) => i.slug) } },
    include: {
      inventory: true,
      category: { select: { isActive: true } },
      images: { where: { isPrimary: true }, take: 1, select: { id: true } },
    },
  });
  const bySlug = new Map(products.map((p) => [p.slug, p]));

  const issues: QuoteIssue[] = [];
  const validLines: QuoteLine[] = [];

  for (const item of items) {
    const p = bySlug.get(item.slug);
    if (!p || !p.isActive || !p.isVisibleOnline || !p.category.isActive) {
      issues.push({
        slug: item.slug,
        name: p?.name,
        code: "unavailable",
        message: `${p?.name ?? "An item"} is no longer available.`,
      });
      continue;
    }

    const onHand = p.inventory?.quantityOnHand ?? 0;
    const reserved = p.inventory?.quantityReserved ?? 0;
    const available = Math.max(0, onHand - reserved);

    if (item.quantity > available) {
      issues.push({
        slug: p.slug,
        name: p.name,
        code: "insufficient_stock",
        message:
          available === 0
            ? `${p.name} is out of stock.`
            : `Only ${available} of ${p.name} left.`,
        available,
      });
      // Still include what CAN be fulfilled in the running total? No — keep the
      // quote honest: an unfulfillable line is excluded from the totals.
      continue;
    }

    validLines.push({
      productId: p.id,
      sku: p.sku,
      slug: p.slug,
      name: p.name,
      primaryImageId: p.images[0]?.id ?? null,
      quantity: item.quantity,
      available,
      unitPricePaise: p.pricePaise,
      gstRateBp: p.gstRateBp,
      lineSubtotalPaise: 0,
      lineTaxPaise: 0,
      lineTotalPaise: 0,
    });
  }

  const totals = computeOrderTotals(
    validLines.map((l) => ({
      unitPricePaise: l.unitPricePaise,
      gstRateBp: l.gstRateBp,
      quantity: l.quantity,
    })),
    {
      pricesIncludeGst,
      shipping: {
        mode: settings["shipping.mode"],
        flatPaise: settings["shipping.flatPaise"],
        freeAbovePaise: settings["shipping.freeAbovePaise"],
      },
    },
  );

  const lines = validLines.map((l, i) => ({
    ...l,
    lineSubtotalPaise: totals.lines[i]!.lineSubtotalPaise,
    lineTaxPaise: totals.lines[i]!.lineTaxPaise,
    lineTotalPaise: totals.lines[i]!.lineTotalPaise,
  }));

  if (
    lines.length > 0 &&
    minOrderValuePaise > 0 &&
    totals.totalPaise < minOrderValuePaise
  ) {
    issues.push({
      slug: "",
      code: "below_minimum",
      message: `Minimum order value is not met.`,
    });
  }

  return {
    lines,
    issues,
    subtotalPaise: totals.subtotalPaise,
    taxPaise: totals.taxPaise,
    shippingPaise: totals.shippingPaise,
    totalPaise: totals.totalPaise,
    pricesIncludeGst,
    minOrderValuePaise,
    currency: "INR",
    fulfillable:
      lines.length > 0 && lines.length === items.length && issues.length === 0,
  };
}
