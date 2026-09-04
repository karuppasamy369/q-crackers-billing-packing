-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('INITIATED', 'SUBMITTED', 'VERIFIED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentChannel" AS ENUM ('UPI', 'BANK_TRANSFER', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentVerificationMethod" AS ENUM ('MANUAL', 'PSP_API', 'WEBHOOK');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "assignedPartnerCode" TEXT,
ADD COLUMN     "assignedPartnerId" UUID;

-- CreateTable
CREATE TABLE "partner_payment_accounts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "upiVpa" TEXT,
    "payeeName" TEXT,
    "staticQrStorageKey" TEXT,
    "instructions" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_payment_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "channel" "PaymentChannel" NOT NULL DEFAULT 'UPI',
    "provider" TEXT NOT NULL DEFAULT 'MANUAL',
    "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "amountPaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "upiReference" TEXT,
    "payerName" TEXT,
    "payerVpa" TEXT,
    "payeeVpa" TEXT,
    "payeeName" TEXT,
    "assignedPartnerId" UUID,
    "submittedAt" TIMESTAMP(3),
    "verifiedById" UUID,
    "verifiedAt" TIMESTAMP(3),
    "verificationMethod" "PaymentVerificationMethod",
    "rejectionReason" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partner_payment_accounts_userId_key" ON "partner_payment_accounts"("userId");

-- CreateIndex
CREATE INDEX "payments_orderId_idx" ON "payments"("orderId");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_assignedPartnerId_idx" ON "payments"("assignedPartnerId");

-- CreateIndex
CREATE INDEX "orders_assignedPartnerId_idx" ON "orders"("assignedPartnerId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_assignedPartnerId_fkey" FOREIGN KEY ("assignedPartnerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_payment_accounts" ADD CONSTRAINT "partner_payment_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_payment_accounts" ADD CONSTRAINT "partner_payment_accounts_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Payment integrity constraints & indexes
-- ---------------------------------------------------------------------------

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_positive" CHECK ("amountPaise" > 0),
  ADD CONSTRAINT "payments_verified_fields" CHECK (
    ("status" IN ('VERIFIED', 'REJECTED') AND "verifiedAt" IS NOT NULL)
    OR "status" NOT IN ('VERIFIED', 'REJECTED')
  );

-- At most one "live" payment per order (INITIATED / SUBMITTED / VERIFIED).
-- A REJECTED or FAILED payment lets the customer try again.
CREATE UNIQUE INDEX "payments_one_active_per_order"
  ON "payments" ("orderId")
  WHERE "status" IN ('INITIATED', 'SUBMITTED', 'VERIFIED');

-- A UTR / UPI reference can only ever be recorded once.
CREATE UNIQUE INDEX "payments_upiReference_unique"
  ON "payments" (LOWER("upiReference"))
  WHERE "upiReference" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- An order's assigned partner is permanent: allow NULL -> value (initial set),
-- reject value -> anything-else.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION orders_assigned_partner_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."assignedPartnerId" IS NOT NULL
     AND NEW."assignedPartnerId" IS DISTINCT FROM OLD."assignedPartnerId" THEN
    RAISE EXCEPTION 'orders.assignedPartnerId is immutable once set'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_assigned_partner_immutable
  BEFORE UPDATE ON "orders"
  FOR EACH ROW EXECUTE FUNCTION orders_assigned_partner_immutable();
