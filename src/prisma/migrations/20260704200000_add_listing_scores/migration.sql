-- CreateTable
CREATE TABLE "listing_scores" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "gScore" DECIMAL(10,2),
    "rScore" DECIMAL(10,2),
    "oScore" DECIMAL(10,2),
    "vScore" DECIMAL(10,2),
    "eScore" DECIMAL(10,2),
    "totalScore" DECIMAL(10,2) NOT NULL,
    "stance" TEXT NOT NULL,
    "breakdown" JSONB NOT NULL,
    "sourceUpdatedAt" TIMESTAMP(3),
    "dataHash" TEXT,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listing_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "listing_scores_listingId_key" ON "listing_scores"("listingId");

-- CreateIndex
CREATE INDEX "listing_scores_totalScore_idx" ON "listing_scores"("totalScore");

-- CreateIndex
CREATE INDEX "listing_scores_stance_idx" ON "listing_scores"("stance");

-- CreateIndex
CREATE INDEX "listing_scores_calculatedAt_idx" ON "listing_scores"("calculatedAt");

-- AddForeignKey
ALTER TABLE "listing_scores"
ADD CONSTRAINT "listing_scores_listingId_fkey"
FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
