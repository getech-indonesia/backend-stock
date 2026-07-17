CREATE TABLE "relative_strength_snapshots" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "scoreDate" TIMESTAMP(3) NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "rank" INTEGER,
    "totalRanked" INTEGER NOT NULL,
    "rsRating" DECIMAL(10,2),
    "rawPerformance" DECIMAL(10,2),
    "roc63" DECIMAL(10,2),
    "roc126" DECIMAL(10,2),
    "roc189" DECIMAL(10,2),
    "roc252" DECIMAL(10,2),
    "close" DECIMAL(14,4),
    "high52" DECIMAL(14,4),
    "low52" DECIMAL(14,4),
    "distanceHighPct" DECIMAL(10,2),
    "distanceLowPct" DECIMAL(10,2),
    "sourcePeriods" JSONB NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "relative_strength_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "relative_strength_snapshots_listingId_scoreDate_modelVersion_key"
    ON "relative_strength_snapshots"("listingId", "scoreDate", "modelVersion");

CREATE INDEX "relative_strength_snapshots_scoreDate_idx"
    ON "relative_strength_snapshots"("scoreDate");

CREATE INDEX "relative_strength_snapshots_listingId_scoreDate_idx"
    ON "relative_strength_snapshots"("listingId", "scoreDate");

CREATE INDEX "relative_strength_snapshots_companyId_scoreDate_idx"
    ON "relative_strength_snapshots"("companyId", "scoreDate");

ALTER TABLE "relative_strength_snapshots"
ADD CONSTRAINT "relative_strength_snapshots_listingId_fkey"
FOREIGN KEY ("listingId") REFERENCES "listings"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
