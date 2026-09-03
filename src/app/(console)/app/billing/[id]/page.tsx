import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { getBill } from "@/server/services/billing-service";
import { isAppError } from "@/server/http/errors";
import { PageHeader, Card, Forbidden } from "@/components/console/ui";
import { formatPaise, formatGstRateBp } from "@/lib/money";
import { fiscalYearLabel } from "@/lib/fiscal-year";
import { amountInWords } from "@/lib/amount-in-words";
import { CancelBill } from "../cancel-bill";

export default async function BillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await requireAuth();
  if (!hasPermission(auth, "billing.view")) return <Forbidden />;

  const { id } = await params;
  let bill;
  try {
    bill = await getBill({ id });
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const canCancel =
    hasPermission(auth, "billing.cancel") && bill.status === "ISSUED";

  return (
    <div className="space-y-6">
      <PageHeader
        title={bill.billNumber}
        description={`${bill.type === "COUNTER" ? "Counter sale" : "Online order"} · FY ${fiscalYearLabel(bill.fiscalYear)} · ${new Date(bill.billedAt).toLocaleString()}`}
        actions={
          <a
            href={`/api/billing/${bill.id}/pdf`}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            Download PDF
          </a>
        }
      />
      <Link
        href="/app/billing"
        className="text-sm text-gray-500 underline hover:text-gray-800"
      >
        ← Back to billing
      </Link>

      {bill.status === "CANCELLED" ? (
        <Card className="border-red-200 bg-red-50">
          <p className="text-sm text-red-800">
            <strong>Cancelled</strong>
            {bill.cancelledBy ? ` by ${bill.cancelledBy.code}` : ""}
            {bill.cancelledAt
              ? ` on ${new Date(bill.cancelledAt).toLocaleString()}`
              : ""}
            {bill.cancelledReason ? ` — ${bill.cancelledReason}` : ""}
          </p>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">HSN</th>
                <th className="px-4 py-3">Qty</th>
                <th className="px-4 py-3">Rate</th>
                <th className="px-4 py-3">Taxable</th>
                <th className="px-4 py-3">
                  {bill.intraState ? "CGST+SGST" : "IGST"}
                </th>
                <th className="px-4 py-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {bill.items.map((i) => (
                <tr
                  key={i.id}
                  className="border-b border-gray-100 last:border-0"
                >
                  <td className="px-4 py-3">
                    {i.name}
                    <span className="ml-1 text-xs text-gray-400">
                      {formatGstRateBp(i.gstRateBp)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {i.hsnCode ?? "—"}
                  </td>
                  <td className="px-4 py-3">{i.quantity}</td>
                  <td className="px-4 py-3">{formatPaise(i.unitPricePaise)}</td>
                  <td className="px-4 py-3">
                    {formatPaise(i.taxableValuePaise)}
                  </td>
                  <td className="px-4 py-3">
                    {formatPaise(i.cgstPaise + i.sgstPaise + i.igstPaise)}
                  </td>
                  <td className="px-4 py-3">{formatPaise(i.lineTotalPaise)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="text-sm">
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-1.5 text-right text-gray-500"
                >
                  Taxable value
                </td>
                <td className="px-4 py-1.5">
                  {formatPaise(bill.taxableValuePaise)}
                </td>
              </tr>
              {bill.intraState ? (
                <>
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-1.5 text-right text-gray-500"
                    >
                      CGST
                    </td>
                    <td className="px-4 py-1.5">
                      {formatPaise(bill.cgstPaise)}
                    </td>
                  </tr>
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-1.5 text-right text-gray-500"
                    >
                      SGST
                    </td>
                    <td className="px-4 py-1.5">
                      {formatPaise(bill.sgstPaise)}
                    </td>
                  </tr>
                </>
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-1.5 text-right text-gray-500"
                  >
                    IGST
                  </td>
                  <td className="px-4 py-1.5">{formatPaise(bill.igstPaise)}</td>
                </tr>
              )}
              {bill.shippingPaise > 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-1.5 text-right text-gray-500"
                  >
                    Delivery
                  </td>
                  <td className="px-4 py-1.5">
                    {formatPaise(bill.shippingPaise)}
                  </td>
                </tr>
              ) : null}
              <tr className="font-semibold">
                <td colSpan={6} className="px-4 py-2 text-right">
                  Grand total
                </td>
                <td className="px-4 py-2">{formatPaise(bill.totalPaise)}</td>
              </tr>
            </tfoot>
          </table>
          <p className="px-4 py-3 text-xs text-gray-500">
            {amountInWords(bill.totalPaise)}
          </p>
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="text-sm font-semibold">Buyer</h2>
            <div className="mt-2 text-sm text-gray-600">
              <p>{bill.buyerName}</p>
              {bill.buyerPhone ? <p>{bill.buyerPhone}</p> : null}
              {bill.buyerGstin ? <p>GSTIN: {bill.buyerGstin}</p> : null}
              {bill.buyerAddress ? <p>{bill.buyerAddress}</p> : null}
              <p className="mt-1">
                Place of supply: {bill.buyerStateName} ({bill.buyerStateCode}) ·{" "}
                {bill.intraState ? "intra-state" : "inter-state"}
              </p>
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold">Details</h2>
            <dl className="mt-2 grid grid-cols-3 gap-1 text-sm">
              <dt className="text-gray-500">Code</dt>
              <dd className="col-span-2 font-mono">{bill.userCode}</dd>
              <dt className="text-gray-500">Issued by</dt>
              <dd className="col-span-2">{bill.createdBy?.code ?? "—"}</dd>
              <dt className="text-gray-500">Payment</dt>
              <dd className="col-span-2">{bill.paymentMode ?? "—"}</dd>
              {bill.order ? (
                <>
                  <dt className="text-gray-500">Order</dt>
                  <dd className="col-span-2 font-mono text-xs">
                    {bill.order.reference.slice(0, 12)}…
                  </dd>
                </>
              ) : null}
            </dl>
          </Card>

          {canCancel ? (
            <Card className="border-red-200">
              <CancelBill billId={bill.id} />
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
