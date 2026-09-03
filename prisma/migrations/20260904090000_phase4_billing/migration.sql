-- CreateEnum
CREATE TYPE "BillType" AS ENUM ('ONLINE_ORDER', 'COUNTER');

-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('ISSUED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'ONLINE', 'OTHER');

-- CreateTable
CREATE TABLE "bill_sequences" (
    "userCode" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bill_sequences_pkey" PRIMARY KEY ("userCode","fiscalYear")
);

-- CreateTable
CREATE TABLE "bills" (
    "id" UUID NOT NULL,
    "billNumber" TEXT NOT NULL,
    "userCode" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "sequenceNo" INTEGER NOT NULL,
    "type" "BillType" NOT NULL,
    "status" "BillStatus" NOT NULL DEFAULT 'ISSUED',
    "createdById" UUID,
    "orderId" UUID,
    "customerId" UUID,
    "sellerName" TEXT NOT NULL,
    "sellerGstin" TEXT,
    "sellerStateCode" TEXT NOT NULL,
    "sellerAddress" TEXT,
    "buyerName" TEXT NOT NULL,
    "buyerPhone" TEXT,
    "buyerGstin" TEXT,
    "buyerAddress" TEXT,
    "buyerStateCode" TEXT NOT NULL,
    "buyerStateName" TEXT NOT NULL,
    "intraState" BOOLEAN NOT NULL,
    "paymentMode" "PaymentMode",
    "subtotalPaise" INTEGER NOT NULL,
    "discountPaise" INTEGER NOT NULL DEFAULT 0,
    "taxableValuePaise" INTEGER NOT NULL,
    "cgstPaise" INTEGER NOT NULL DEFAULT 0,
    "sgstPaise" INTEGER NOT NULL DEFAULT 0,
    "igstPaise" INTEGER NOT NULL DEFAULT 0,
    "shippingPaise" INTEGER NOT NULL DEFAULT 0,
    "roundOffPaise" INTEGER NOT NULL DEFAULT 0,
    "totalPaise" INTEGER NOT NULL,
    "pdfStorageKey" TEXT,
    "cancelledReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" UUID,
    "billedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_items" (
    "id" UUID NOT NULL,
    "billId" UUID NOT NULL,
    "productId" UUID,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hsnCode" TEXT,
    "unitPricePaise" INTEGER NOT NULL,
    "gstRateBp" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "discountPaise" INTEGER NOT NULL DEFAULT 0,
    "taxableValuePaise" INTEGER NOT NULL,
    "cgstPaise" INTEGER NOT NULL DEFAULT 0,
    "sgstPaise" INTEGER NOT NULL DEFAULT 0,
    "igstPaise" INTEGER NOT NULL DEFAULT 0,
    "lineTotalPaise" INTEGER NOT NULL,

    CONSTRAINT "bill_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bills_billNumber_key" ON "bills"("billNumber");

-- CreateIndex
CREATE UNIQUE INDEX "bills_orderId_key" ON "bills"("orderId");

-- CreateIndex
CREATE INDEX "bills_userCode_fiscalYear_sequenceNo_idx" ON "bills"("userCode", "fiscalYear", "sequenceNo");

-- CreateIndex
CREATE INDEX "bills_status_idx" ON "bills"("status");

-- CreateIndex
CREATE INDEX "bills_billedAt_idx" ON "bills"("billedAt");

-- CreateIndex
CREATE INDEX "bills_customerId_idx" ON "bills"("customerId");

-- CreateIndex
CREATE INDEX "bill_items_billId_idx" ON "bill_items"("billId");

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_items" ADD CONSTRAINT "bill_items_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_items" ADD CONSTRAINT "bill_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Rename the seeded partner login codes to the real billing codes.
-- (S1 / S2 are unchanged. Historical audit_logs keep their old snapshot.)
-- ---------------------------------------------------------------------------
UPDATE "users" SET "code" = 'PK'  WHERE "code" = 'P1';
UPDATE "users" SET "code" = 'PSR' WHERE "code" = 'P2';
UPDATE "users" SET "code" = 'KA'  WHERE "code" = 'P3';

-- ---------------------------------------------------------------------------
-- Bill integrity constraints (not expressible in the Prisma schema)
-- ---------------------------------------------------------------------------

ALTER TABLE "bill_sequences"
  ADD CONSTRAINT "bill_sequences_lastNumber_nonneg" CHECK ("lastNumber" >= 0),
  ADD CONSTRAINT "bill_sequences_fiscalYear_range" CHECK ("fiscalYear" BETWEEN 2000 AND 3000);

ALTER TABLE "bills"
  ADD CONSTRAINT "bills_sequenceNo_positive" CHECK ("sequenceNo" > 0),
  ADD CONSTRAINT "bills_money_nonneg" CHECK (
    "subtotalPaise" >= 0 AND "discountPaise" >= 0 AND "taxableValuePaise" >= 0
    AND "cgstPaise" >= 0 AND "sgstPaise" >= 0 AND "igstPaise" >= 0
    AND "shippingPaise" >= 0 AND "totalPaise" >= 0
  ),
  ADD CONSTRAINT "bills_discount_within_subtotal" CHECK ("discountPaise" <= "subtotalPaise"),
  ADD CONSTRAINT "bills_taxable_value" CHECK ("taxableValuePaise" = "subtotalPaise" - "discountPaise"),
  -- Intra-state uses CGST+SGST (no IGST); inter-state uses IGST only.
  ADD CONSTRAINT "bills_gst_split" CHECK (
    ("intraState" AND "igstPaise" = 0) OR (NOT "intraState" AND "cgstPaise" = 0 AND "sgstPaise" = 0)
  ),
  ADD CONSTRAINT "bills_total_consistent" CHECK (
    "totalPaise" = "taxableValuePaise" + "cgstPaise" + "sgstPaise" + "igstPaise" + "shippingPaise" + "roundOffPaise"
  ),
  -- An ONLINE_ORDER bill must reference an order; a COUNTER bill must not.
  ADD CONSTRAINT "bills_type_order_link" CHECK (
    ("type" = 'ONLINE_ORDER' AND "orderId" IS NOT NULL)
    OR ("type" = 'COUNTER' AND "orderId" IS NULL)
  ),
  ADD CONSTRAINT "bills_cancel_fields" CHECK (
    ("status" = 'CANCELLED' AND "cancelledAt" IS NOT NULL AND "cancelledReason" IS NOT NULL)
    OR ("status" = 'ISSUED' AND "cancelledAt" IS NULL)
  );

ALTER TABLE "bill_items"
  ADD CONSTRAINT "bill_items_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "bill_items_money_nonneg" CHECK (
    "unitPricePaise" >= 0 AND "gstRateBp" >= 0 AND "discountPaise" >= 0
    AND "taxableValuePaise" >= 0 AND "cgstPaise" >= 0 AND "sgstPaise" >= 0
    AND "igstPaise" >= 0 AND "lineTotalPaise" >= 0
  ),
  ADD CONSTRAINT "bill_items_line_consistent" CHECK (
    "lineTotalPaise" = "taxableValuePaise" + "cgstPaise" + "sgstPaise" + "igstPaise"
  );
