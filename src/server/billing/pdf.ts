import "server-only";

import { createElement as h, type ReactElement, type ReactNode } from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { Bill, BillItem } from "@/generated/prisma";
import { formatPaise, formatGstRateBp } from "@/lib/money";
import { fiscalYearLabel } from "@/lib/fiscal-year";
import { amountInWords } from "@/lib/amount-in-words";

/** react-pdf's Style type is not exported at runtime; StyleSheet.create keeps
 *  each value's shape, and this is the union of the styles used below. */
type Sty = (typeof st)[keyof typeof st] | undefined;

export type BillForPdf = Bill & { items: BillItem[] };

// JSX is avoided here on purpose: `tsconfig.json` sets `jsx: "preserve"` for
// Next, which trips up test tooling. `h(...)` (React.createElement) needs no
// transform.
const st = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica", color: "#111" },
  bold: { fontFamily: "Helvetica-Bold" },
  h1: { fontSize: 15, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  muted: { color: "#555" },
  between: { flexDirection: "row", justifyContent: "space-between" },
  right: { textAlign: "right" },
  box: {
    borderWidth: 1,
    borderColor: "#999",
    borderStyle: "solid",
    padding: 8,
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  half: { width: "48%" },
  th: {
    flexDirection: "row",
    backgroundColor: "#eee",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#999",
    borderStyle: "solid",
    paddingVertical: 4,
    fontFamily: "Helvetica-Bold",
  },
  td: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: "#ddd",
    borderStyle: "solid",
    paddingVertical: 3,
  },
  cNo: { width: "5%" },
  cName: { width: "33%" },
  cHsn: { width: "10%" },
  cNum: { width: "13%", textAlign: "right" },
  totals: { marginTop: 8, alignSelf: "flex-end", width: "48%" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 1,
  },
  grand: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderColor: "#999",
    borderStyle: "solid",
    paddingTop: 3,
    marginTop: 3,
    fontFamily: "Helvetica-Bold",
  },
  cancelled: { marginTop: 6, color: "#b00", fontFamily: "Helvetica-Bold" },
  footer: { marginTop: 24, fontSize: 8, color: "#555" },
  mt10: { marginTop: 10 },
});

const t = (style: Sty, children: ReactNode) => h(Text, { style }, children);
const v = (style: Sty, children: ReactNode) => h(View, { style }, children);
const m = (n: number) => formatPaise(n);

function totalsRow(label: string, value: string): ReactElement {
  return v(st.totalRow, [t(undefined, label), t(undefined, value)]);
}

export function buildBillDocument(bill: BillForPdf): ReactElement {
  const header = v(st.between, [
    v(undefined, [
      t(st.h1, bill.sellerName),
      bill.sellerAddress ? t(st.muted, bill.sellerAddress) : null,
      bill.sellerGstin ? t(st.muted, `GSTIN: ${bill.sellerGstin}`) : null,
      t(st.muted, `State code: ${bill.sellerStateCode}`),
    ]),
    v(st.right, [
      t(st.bold, "TAX INVOICE"),
      t(undefined, bill.billNumber),
      t(st.muted, `FY ${fiscalYearLabel(bill.fiscalYear)}`),
      t(st.muted, new Date(bill.billedAt).toLocaleDateString("en-IN")),
      bill.paymentMode ? t(st.muted, `Payment: ${bill.paymentMode}`) : null,
    ]),
  ]);

  const parties = v(st.box, [
    v(st.half, [
      t(st.bold, "Bill to"),
      t(undefined, bill.buyerName),
      bill.buyerPhone ? t(st.muted, bill.buyerPhone) : null,
      bill.buyerGstin ? t(st.muted, `GSTIN: ${bill.buyerGstin}`) : null,
      bill.buyerAddress ? t(st.muted, bill.buyerAddress) : null,
    ]),
    v(st.half, [
      t(st.bold, "Place of supply"),
      t(undefined, `${bill.buyerStateName} (${bill.buyerStateCode})`),
      t(
        st.muted,
        bill.intraState ? "Intra-state (CGST + SGST)" : "Inter-state (IGST)",
      ),
    ]),
  ]);

  const gstHeader = bill.intraState ? "CGST+SGST" : "IGST";
  const rows = [
    v(st.th, [
      t(st.cNo, "#"),
      t(st.cName, "Item"),
      t(st.cHsn, "HSN"),
      t(st.cNum, "Qty"),
      t(st.cNum, "Rate"),
      t(st.cNum, "Taxable"),
      t(st.cNum, gstHeader),
      t(st.cNum, "Total"),
    ]),
    ...bill.items.map((it, i) =>
      v(st.td, [
        t(st.cNo, String(i + 1)),
        t(st.cName, `${it.name}  (${formatGstRateBp(it.gstRateBp)})`),
        t(st.cHsn, it.hsnCode ?? "-"),
        t(st.cNum, String(it.quantity)),
        t(st.cNum, m(it.unitPricePaise)),
        t(st.cNum, m(it.taxableValuePaise)),
        t(st.cNum, m(it.cgstPaise + it.sgstPaise + it.igstPaise)),
        t(st.cNum, m(it.lineTotalPaise)),
      ]),
    ),
  ];

  const totalRows: (ReactElement | null)[] = [
    totalsRow("Taxable value", m(bill.taxableValuePaise)),
    bill.discountPaise > 0
      ? totalsRow("Discount", `-${m(bill.discountPaise)}`)
      : null,
    ...(bill.intraState
      ? [
          totalsRow("CGST", m(bill.cgstPaise)),
          totalsRow("SGST", m(bill.sgstPaise)),
        ]
      : [totalsRow("IGST", m(bill.igstPaise))]),
    bill.shippingPaise > 0
      ? totalsRow("Delivery", m(bill.shippingPaise))
      : null,
    bill.roundOffPaise !== 0
      ? totalsRow("Round off", m(bill.roundOffPaise))
      : null,
    v(st.grand, [
      t(undefined, "Grand total"),
      t(undefined, m(bill.totalPaise)),
    ]),
  ];

  const body = [
    header,
    parties,
    v(st.mt10, rows),
    v(st.totals, totalRows),
    t(st.mt10, [
      t(st.bold, "Amount in words: "),
      amountInWords(bill.totalPaise),
    ]),
    bill.status === "CANCELLED"
      ? t(
          st.cancelled,
          `CANCELLED${bill.cancelledReason ? ` — ${bill.cancelledReason}` : ""}`,
        )
      : null,
    t(st.footer, "This is a computer-generated tax invoice."),
  ];

  return h(
    Document,
    { title: bill.billNumber, author: bill.sellerName, creator: "Q Crackers" },
    h(Page, { size: "A4", style: st.page }, body),
  );
}

export async function renderBillPdf(bill: BillForPdf): Promise<Uint8Array> {
  const buffer = await renderToBuffer(
    buildBillDocument(bill) as Parameters<typeof renderToBuffer>[0],
  );
  return new Uint8Array(buffer);
}
