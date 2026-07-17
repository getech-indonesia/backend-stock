CREATE TABLE "listing_score_snapshots" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "scoreDate" TIMESTAMP(3) NOT NULL,
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

    CONSTRAINT "listing_score_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "listing_score_snapshots_listingId_scoreDate_modelVersion_key"
    ON "listing_score_snapshots"("listingId", "scoreDate", "modelVersion");

CREATE INDEX "listing_score_snapshots_scoreDate_idx"
    ON "listing_score_snapshots"("scoreDate");

CREATE INDEX "listing_score_snapshots_listingId_scoreDate_idx"
    ON "listing_score_snapshots"("listingId", "scoreDate");

ALTER TABLE "listing_score_snapshots"
ADD CONSTRAINT "listing_score_snapshots_listingId_fkey"
FOREIGN KEY ("listingId") REFERENCES "listings"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
