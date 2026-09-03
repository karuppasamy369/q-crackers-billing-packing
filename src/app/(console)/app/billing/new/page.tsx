import Link from "next/link";
import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { db } from "@/server/db";
import { getSetting } from "@/server/services/settings-service";
import { PageHeader, Card, Forbidden } from "@/components/console/ui";
import { CounterBillForm } from "../counter-bill-form";

export default async function NewCounterBillPage() {
  const auth = await requireAuth();
  if (!hasPermission(auth, "billing.create")) return <Forbidden />;

  const [products, pricesIncludeGst] = await Promise.all([
    db.product.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: { inventory: true },
    }),
    getSetting("tax.pricesIncludeGst"),
  ]);

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader
        title="New counter bill"
        description={`Billed under your code — ${auth.user.code}.`}
      />
      <Link
        href="/app/billing"
        className="text-sm text-gray-500 underline hover:text-gray-800"
      >
        ← Back to billing
      </Link>

      {products.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-600">
            Add active products first in{" "}
            <Link href="/app/products" className="underline">
              Products
            </Link>
            .
          </p>
        </Card>
      ) : (
        <Card>
          <CounterBillForm
            pricesIncludeGst={pricesIncludeGst}
            products={products.map((p) => ({
              id: p.id,
              sku: p.sku,
              name: p.name,
              pricePaise: p.pricePaise,
              available:
                (p.inventory?.quantityOnHand ?? 0) -
                (p.inventory?.quantityReserved ?? 0),
            }))}
          />
        </Card>
      )}
    </div>
  );
}
