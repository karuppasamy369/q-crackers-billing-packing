-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('AWAITING_PAYMENT', 'PAYMENT_FAILED', 'PAID', 'PACKED', 'PARCEL_BOOKED', 'COMPLETED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "OrderPaymentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('ONLINE', 'INTERNAL');

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneNormalized" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "customerId" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "paymentStatus" "OrderPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "source" "OrderSource" NOT NULL DEFAULT 'ONLINE',
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerEmail" TEXT,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "stateCode" TEXT NOT NULL,
    "stateName" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "subtotalPaise" INTEGER NOT NULL,
    "discountPaise" INTEGER NOT NULL DEFAULT 0,
    "taxPaise" INTEGER NOT NULL,
    "shippingPaise" INTEGER NOT NULL,
    "totalPaise" INTEGER NOT NULL,
    "pricesIncludeGst" BOOLEAN NOT NULL,
    "shippingMode" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "holdExpiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "unitPricePaise" INTEGER NOT NULL,
    "gstRateBp" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "lineSubtotalPaise" INTEGER NOT NULL,
    "lineTaxPaise" INTEGER NOT NULL,
    "lineTotalPaise" INTEGER NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus" NOT NULL,
    "changedById" UUID,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_phoneNormalized_idx" ON "customers"("phoneNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "orders_reference_key" ON "orders"("reference");

-- CreateIndex
CREATE INDEX "orders_customerId_idx" ON "orders"("customerId");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_paymentStatus_idx" ON "orders"("paymentStatus");

-- CreateIndex
CREATE INDEX "orders_placedAt_idx" ON "orders"("placedAt");

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");

-- CreateIndex
CREATE INDEX "order_items_productId_idx" ON "order_items"("productId");

-- CreateIndex
CREATE INDEX "order_status_history_orderId_createdAt_idx" ON "order_status_history"("orderId", "createdAt");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Data-integrity constraints not expressible in the Prisma schema
-- ---------------------------------------------------------------------------

-- All order money is non-negative integer paise, and the total is internally
-- consistent (subtotal - discount + tax + shipping = total).
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_money_nonneg" CHECK (
    "subtotalPaise" >= 0 AND "discountPaise" >= 0 AND "taxPaise" >= 0
    AND "shippingPaise" >= 0 AND "totalPaise" >= 0
  ),
  ADD CONSTRAINT "orders_discount_within_subtotal" CHECK ("discountPaise" <= "subtotalPaise"),
  ADD CONSTRAINT "orders_total_consistent" CHECK (
    "totalPaise" = "subtotalPaise" - "discountPaise" + "taxPaise" + "shippingPaise"
  );

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "order_items_money_nonneg" CHECK (
    "unitPricePaise" >= 0 AND "gstRateBp" >= 0
    AND "lineSubtotalPaise" >= 0 AND "lineTaxPaise" >= 0 AND "lineTotalPaise" >= 0
  ),
  ADD CONSTRAINT "order_items_line_consistent" CHECK (
    "lineTotalPaise" = "lineSubtotalPaise" + "lineTaxPaise"
  );
