-- CreateTable
CREATE TABLE "tracking_tokens" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedById" UUID,
    "rotatedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracking_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tracking_tokens_orderId_key" ON "tracking_tokens"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "tracking_tokens_tokenHash_key" ON "tracking_tokens"("tokenHash");

-- AddForeignKey
ALTER TABLE "tracking_tokens" ADD CONSTRAINT "tracking_tokens_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_tokens" ADD CONSTRAINT "tracking_tokens_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_tokens" ADD CONSTRAINT "tracking_tokens_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Tracking-token integrity
-- ---------------------------------------------------------------------------

-- The token hash is a 64-char SHA-256 hex digest; reject anything else so a
-- raw token can never be stored here by mistake.
ALTER TABLE "tracking_tokens"
  ADD CONSTRAINT "tracking_tokens_hash_is_sha256_hex"
  CHECK ("tokenHash" ~ '^[0-9a-f]{64}$');

-- A revoked token must carry its revocation timestamp.
ALTER TABLE "tracking_tokens"
  ADD CONSTRAINT "tracking_tokens_revoked_consistent"
  CHECK (("revokedById" IS NULL) OR ("revokedAt" IS NOT NULL));
