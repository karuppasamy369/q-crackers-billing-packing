-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('WHATSAPP');

-- CreateEnum
CREATE TYPE "NotificationEventType" AS ENUM ('PAYMENT_RECEIVED', 'ORDER_PACKED', 'PARCEL_BOOKED', 'LR_AVAILABLE', 'REVIEW_REQUEST');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'DEAD', 'SKIPPED');

-- AlterTable
ALTER TABLE "tracking_tokens" ADD COLUMN "linkVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en';

-- CreateTable
CREATE TABLE "notification_outbox" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "customerId" UUID,
    "eventType" "NotificationEventType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'WHATSAPP',
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "dedupeKey" TEXT NOT NULL,
    "recipientPhone" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "provider" TEXT NOT NULL DEFAULT 'none',
    "providerMessageId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastAttemptAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "renderedBody" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_outbox_dedupeKey_key" ON "notification_outbox"("dedupeKey");

-- CreateIndex
CREATE INDEX "notification_outbox_status_nextAttemptAt_idx" ON "notification_outbox"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "notification_outbox_orderId_idx" ON "notification_outbox"("orderId");

-- AddForeignKey
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Notification outbox integrity
-- ---------------------------------------------------------------------------

-- Attempt counters stay sane.
ALTER TABLE "notification_outbox"
  ADD CONSTRAINT "notification_outbox_attempts_sane"
  CHECK ("attempts" >= 0 AND "maxAttempts" > 0 AND "attempts" <= "maxAttempts");

-- The recipient, when present, is a normalised Indian mobile in E.164 form.
ALTER TABLE "notification_outbox"
  ADD CONSTRAINT "notification_outbox_recipient_e164"
  CHECK ("recipientPhone" IS NULL OR "recipientPhone" ~ '^\+91[6-9][0-9]{9}$');

-- A SENT row carries its delivery timestamp.
ALTER TABLE "notification_outbox"
  ADD CONSTRAINT "notification_outbox_sent_has_timestamp"
  CHECK ("status" <> 'SENT' OR "sentAt" IS NOT NULL);
