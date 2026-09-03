/**
 * Pure order-total maths. All amounts are integer paise. This module has no
 * DB or settings access — callers pass in the product snapshots and the
 * relevant settings, so the exact same function computes the cart quote and
 * the persisted order, and it is trivially unit-testable.
 */

export type PriceLineInput = {
  unitPricePaise: number;
  gstRateBp: number;
  quantity: number;
};

export type PriceLine = PriceLineInput & {
  lineSubtotalPaise: number;
  lineTaxPaise: number;
  lineTotalPaise: number;
};

export type ShippingMode = "none" | "flat" | "pincode" | "weight";

export type ShippingConfig = {
  mode: ShippingMode;
  flatPaise: number;
  /** 0 = shipping is never free. */
  freeAbovePaise: number;
};

export type OrderTotalsOptions = {
  pricesIncludeGst: boolean;
  shipping: ShippingConfig;
};

export type OrderTotals = {
  lines: PriceLine[];
  subtotalPaise: number;
  taxPaise: number;
  discountPaise: number;
  shippingPaise: number;
  totalPaise: number;
};

/** Compute one line's ex-GST subtotal, GST amount, and inclusive total. */
export function computeLine(
  input: PriceLineInput,
  pricesIncludeGst: boolean,
): PriceLine {
  const qty = Math.max(0, Math.trunc(input.quantity));
  const rate = Math.max(0, input.gstRateBp);
  const gross = input.unitPricePaise * qty;

  if (pricesIncludeGst) {
    // Extract the GST portion already baked into the price.
    const lineTaxPaise = Math.round((gross * rate) / (10000 + rate));
    return {
      ...input,
      quantity: qty,
      lineSubtotalPaise: gross - lineTaxPaise,
      lineTaxPaise,
      lineTotalPaise: gross,
    };
  }

  const lineSubtotalPaise = gross;
  const lineTaxPaise = Math.round((lineSubtotalPaise * rate) / 10000);
  return {
    ...input,
    quantity: qty,
    lineSubtotalPaise,
    lineTaxPaise,
    lineTotalPaise: lineSubtotalPaise + lineTaxPaise,
  };
}

/** Shipping charge for a given goods total. `pincode`/`weight` are not yet
 *  calculated — they fall back to the flat rate. */
export function computeShipping(
  goodsTotalPaise: number,
  cfg: ShippingConfig,
): number {
  if (cfg.mode === "none") return 0;
  if (cfg.freeAbovePaise > 0 && goodsTotalPaise >= cfg.freeAbovePaise) return 0;
  return Math.max(0, cfg.flatPaise);
}

export function computeOrderTotals(
  items: PriceLineInput[],
  opts: OrderTotalsOptions,
): OrderTotals {
  const lines = items.map((i) => computeLine(i, opts.pricesIncludeGst));
  const subtotalPaise = lines.reduce((s, l) => s + l.lineSubtotalPaise, 0);
  const taxPaise = lines.reduce((s, l) => s + l.lineTaxPaise, 0);
  const discountPaise = 0;
  const goodsTotalPaise = subtotalPaise + taxPaise - discountPaise;
  const shippingPaise =
    lines.length === 0 ? 0 : computeShipping(goodsTotalPaise, opts.shipping);
  const totalPaise = subtotalPaise - discountPaise + taxPaise + shippingPaise;

  return {
    lines,
    subtotalPaise,
    taxPaise,
    discountPaise,
    shippingPaise,
    totalPaise,
  };
}

export type GstSplit = {
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
};

/**
 * Split a GST amount into CGST/SGST (intra-state supply — place of supply is
 * the seller's own state) or IGST (inter-state).
 */
export function splitGst(taxPaise: number, intraState: boolean): GstSplit {
  const tax = Math.max(0, Math.round(taxPaise));
  if (!intraState) {
    return { cgstPaise: 0, sgstPaise: 0, igstPaise: tax };
  }
  const cgstPaise = Math.floor(tax / 2);
  return { cgstPaise, sgstPaise: tax - cgstPaise, igstPaise: 0 };
}

// --- Tax invoice --------------------------------------------------------

export type InvoiceLineInput = PriceLineInput & {
  discountPaise?: number;
};

export type InvoiceLine = InvoiceLineInput &
  GstSplit & {
    discountPaise: number;
    taxableValuePaise: number;
    lineTotalPaise: number;
  };

export type Invoice = {
  lines: InvoiceLine[];
  subtotalPaise: number;
  discountPaise: number;
  taxableValuePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  shippingPaise: number;
  roundOffPaise: number;
  totalPaise: number;
  intraState: boolean;
};

/**
 * Build a GST tax invoice from line inputs. Per-line GST is computed then split
 * into CGST/SGST or IGST; bill totals are the sums. All integer paise.
 */
export function computeInvoice(
  items: InvoiceLineInput[],
  opts: {
    pricesIncludeGst: boolean;
    intraState: boolean;
    shippingPaise?: number;
  },
): Invoice {
  const lines: InvoiceLine[] = items.map((item) => {
    const priced = computeLine(item, opts.pricesIncludeGst);
    const discountPaise = Math.max(0, Math.trunc(item.discountPaise ?? 0));
    const taxableValuePaise = Math.max(
      0,
      priced.lineSubtotalPaise - discountPaise,
    );
    // Re-derive tax on the discounted taxable value so the invoice is exact.
    const rate = Math.max(0, item.gstRateBp);
    const lineTaxPaise = Math.round((taxableValuePaise * rate) / 10000);
    const split = splitGst(lineTaxPaise, opts.intraState);
    return {
      ...item,
      discountPaise,
      taxableValuePaise,
      ...split,
      lineTotalPaise:
        taxableValuePaise + split.cgstPaise + split.sgstPaise + split.igstPaise,
    };
  });

  const subtotalPaise = lines.reduce(
    (s, l) => s + l.taxableValuePaise + l.discountPaise,
    0,
  );
  const discountPaise = lines.reduce((s, l) => s + l.discountPaise, 0);
  const taxableValuePaise = lines.reduce((s, l) => s + l.taxableValuePaise, 0);
  const cgstPaise = lines.reduce((s, l) => s + l.cgstPaise, 0);
  const sgstPaise = lines.reduce((s, l) => s + l.sgstPaise, 0);
  const igstPaise = lines.reduce((s, l) => s + l.igstPaise, 0);
  const shippingPaise = Math.max(0, Math.trunc(opts.shippingPaise ?? 0));
  const roundOffPaise = 0;
  const totalPaise =
    taxableValuePaise +
    cgstPaise +
    sgstPaise +
    igstPaise +
    shippingPaise +
    roundOffPaise;

  return {
    lines,
    subtotalPaise,
    discountPaise,
    taxableValuePaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    shippingPaise,
    roundOffPaise,
    totalPaise,
    intraState: opts.intraState,
  };
}
