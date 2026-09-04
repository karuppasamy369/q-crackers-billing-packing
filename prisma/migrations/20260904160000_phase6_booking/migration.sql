-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "courierName" TEXT,
    "lrNumber" TEXT,
    "bookingDate" DATE,
    "parcelCount" INTEGER,
    "remarks" TEXT,
    "packedAt" TIMESTAMP(3),
    "packedById" UUID,
    "parcelBookedAt" TIMESTAMP(3),
    "parcelBookedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lr_documents" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "uploadedById" UUID,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "lr_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bookings_orderId_key" ON "bookings"("orderId");

-- CreateIndex
CREATE INDEX "lr_documents_bookingId_idx" ON "lr_documents"("bookingId");

-- CreateIndex
CREATE INDEX "lr_documents_orderId_idx" ON "lr_documents"("orderId");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_packedById_fkey" FOREIGN KEY ("packedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_parcelBookedById_fkey" FOREIGN KEY ("parcelBookedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lr_documents" ADD CONSTRAINT "lr_documents_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lr_documents" ADD CONSTRAINT "lr_documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Booking integrity constraints
-- ---------------------------------------------------------------------------

-- Parcel count, when set, is a positive integer.
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_parcel_count_positive"
  CHECK ("parcelCount" IS NULL OR "parcelCount" > 0);

-- An order cannot be PARCEL_BOOKED without all four mandatory courier/LR fields.
-- This backs up the service-layer validation at the database level.
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_parcel_booked_requires_details" CHECK (
    "parcelBookedAt" IS NULL
    OR (
      "courierName" IS NOT NULL
      AND "lrNumber" IS NOT NULL
      AND "bookingDate" IS NOT NULL
      AND "parcelCount" IS NOT NULL
    )
  );

-- Uploaded documents are never empty.
ALTER TABLE "lr_documents"
  ADD CONSTRAINT "lr_documents_bytesize_positive" CHECK ("byteSize" > 0);

-- At most one *current* LR document per order (decision 16: "one current LR
-- PDF per order in V1"). Superseded rows keep the history.
CREATE UNIQUE INDEX "lr_documents_one_current_per_order"
  ON "lr_documents" ("orderId")
  WHERE "isCurrent";
