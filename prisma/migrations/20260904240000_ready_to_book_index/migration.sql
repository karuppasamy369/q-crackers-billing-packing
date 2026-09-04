-- Compound index for workflow-stage queries (Ready to Book filters on
-- status = PACKED AND paymentStatus = PAID). Additive and non-destructive.
CREATE INDEX "orders_status_paymentStatus_idx" ON "orders" ("status", "paymentStatus");
