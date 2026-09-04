import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { getMyPaymentAccount } from "@/server/services/payment-accounts-service";
import { renderQrDataUri } from "@/server/payments/qr";
import { PageHeader, Card, Forbidden } from "@/components/console/ui";
import { env } from "@/env";
import { PaymentAccountForm, StaticQrControls } from "./payment-account-form";

export default async function PaymentAccountPage() {
  const auth = await requireAuth();
  if (!hasPermission(auth, "payments.account.manage")) return <Forbidden />;

  const { account, partnerCode } = await getMyPaymentAccount();

  const linkPath = `/s/${partnerCode.toLowerCase()}`;
  const linkUrl = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}${linkPath}`;
  const linkQr = await renderQrDataUri(linkUrl);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payment account"
        description="Your UPI collection details and shareable order link. Customers who order through your link are billed under your code."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <h2 className="mb-4 text-sm font-semibold">UPI collection details</h2>
          <PaymentAccountForm
            defaults={{
              upiVpa: account.upiVpa ?? "",
              payeeName: account.payeeName ?? "",
              instructions: account.instructions ?? "",
              isActive: account.isActive,
            }}
          />
          <p className="mt-4 text-xs text-gray-500">
            When active and a UPI ID is set, checkout shows an amount-filled QR
            generated from these details. Turning the account off hides your
            details from checkout (orders already assigned to you keep their
            partner).
          </p>
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-2 text-sm font-semibold">Your order link</h2>
            <p className="break-all font-mono text-xs text-gray-600">
              {linkUrl}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={linkQr}
              alt={`QR code for ${linkPath}`}
              width={200}
              height={200}
              className="mx-auto mt-3 h-48 w-48"
            />
          </Card>

          <Card>
            <h2 className="mb-2 text-sm font-semibold">
              Static QR (fallback, optional)
            </h2>
            <StaticQrControls
              hasQr={Boolean(account.staticQrStorageKey)}
              partnerId={account.userId}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
