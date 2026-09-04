-- Optional customer-uploaded payment screenshot alongside the (still
-- mandatory) UTR. Additive and non-destructive: one nullable column.
ALTER TABLE "payments" ADD COLUMN "screenshotStorageKey" TEXT;
