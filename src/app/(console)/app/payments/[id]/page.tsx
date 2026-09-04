import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { getPaymentForConsole } from "@/server/services/payments-service";
import { isAppError } from "@/server/http/errors";
import { PageHeader, Card, Forbidden } from "@/components/console/ui";
import { formatPaise } from "@/lib/money";
import { VerifyPaymentForm } from "../verify-payment-form";

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await requireAuth();
  if (!hasPermission(auth, "payments.view")) return <Forbidden />;
  const canVerify = hasPermission(auth, "payments.confirm_manual");

  const { id } = await params;
  let payment;
  try {
    payment = await getPaymentForConsole({ id });
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const order = payment.order;
  const amountMismatch = payment.amountPaise !== order.totalPaise;

  const rows: [string, React.ReactNode][] = [
    ["Status", payment.status],
    ["Channel", `${payment.channel} · ${payment.provider}`],
    ["Amount submitted", formatPaise(payment.amountPaise)],
    ["Order total", formatPaise(order.totalPaise)],
    ["UPI transaction ID / UTR", payment.upiReference ?? "—"],
    ["Payer name", payment.payerName ?? "—"],
    ["Payer UPI ID", payment.payerVpa ?? "—"],
    ["Collecting UPI ID", payment.payeeVpa ?? "—"],
    ["Assigned partner", order.assignedPartnerCode ?? "—"],
    [
      "Submitted",
      payment.submittedAt
        ? new Date(payment.submittedAt).toLocaleString()
        : "—",
    ],
    [
      "Verified / rejected",
      payment.verifiedAt
        ? `${new Date(payment.verifiedAt).toLocaleString()}${
            payment.verifiedBy ? ` by ${payment.verifiedBy.code}` : ""
          }${
            payment.verificationMethod
              ? ` (${payment.verificationMethod})`
              : ""
          }`
        : "—",
    ],
  ];
  if (payment.rejectionReason) {
    rows.push(["Rejection reason", payment.rejectionReason]);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payment"
        description={`Order ${order.reference.slice(0, 12)}… · ${order.customerName}`}
      />
      <Link
        href="/app/payments"
        className="text-sm text-gray-500 underline hover:text-gray-800"
      >
        ← Back to payments
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="p-0">
          <table className="w-full text-sm">
            <tbody>
              {rows.map(([label, value]) => (
                <tr
                  key={label}
                  className="border-b border-gray-100 last:border-0"
                >
                  <td className="px-4 py-3 text-gray-500">{label}</td>
                  <td className="px-4 py-3">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-gray-200 p-4 text-sm">
            <Link
              href={`/app/orders/${order.id}`}
              className="underline hover:text-gray-900"
            >
              Open order
            </Link>
            {order.bill ? (
              <>
                {" · "}
                <Link
                  href={`/app/billing/${order.bill.id}`}
                  className="underline hover:text-gray-900"
                >
                  Bill {order.bill.billNumber}
                </Link>
              </>
            ) : null}
          </div>
        </Card>

        <div className="space-y-6">
          {payment.screenshotStorageKey ? (
            <Card>
              <h2 className="mb-2 text-sm font-semibold">Payment screenshot</h2>
              <a
                href={`/api/payments/screenshot/${payment.id}`}
                target="_blank"
                rel="noreferrer"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/payments/screenshot/${payment.id}`}
                  alt="Payment screenshot the customer uploaded"
                  className="mx-auto max-h-64 w-full rounded-md border border-gray-200 object-contain"
                />
              </a>
              <p className="mt-2 text-center text-xs text-gray-500">
                Optional extra evidence from the customer — the UTR above is
                what matters most; check it against your own bank/UPI app.
              </p>
            </Card>
          ) : null}

          {amountMismatch ? (
            <Card className="border-red-200 bg-red-50">
              <h2 className="text-sm font-semibold text-red-800">
                Amount mismatch
              </h2>
              <p className="mt-1 text-sm text-red-700">
                The submitted amount does not match the order total. This
                payment cannot be verified — reject it and ask the customer to
                pay the correct amount.
              </p>
            </Card>
          ) : null}

          {payment.status === "SUBMITTED" && canVerify ? (
            <Card>
              <h2 className="mb-3 text-sm font-semibold">Review this payment</h2>
              <p className="mb-3 text-xs text-gray-500">
                Only verify after you have confirmed in the collecting
                account&apos;s bank / UPI app that {formatPaise(
                  payment.amountPaise,
                )}{" "}
                was received
                {payment.upiReference
                  ? ` against UTR ${payment.upiReference}`
                  : ""}
                .
              </p>
              <VerifyPaymentForm
                paymentId={payment.id}
                recordedUtr={payment.upiReference}
              />
            </Card>
          ) : payment.status === "SUBMITTED" ? (
            <Card>
              <p className="text-sm text-gray-500">
                This payment is awaiting verification by an authorised person.
              </p>
            </Card>
          ) : null}

          <Card>
            <h2 className="text-sm font-semibold">Order items</h2>
            <ul className="mt-2 space-y-1 text-sm text-gray-600">
              {order.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-2">
                  <span>
                    {i.productName} × {i.quantity}
                  </span>
                  <span>{formatPaise(i.lineTotalPaise)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
