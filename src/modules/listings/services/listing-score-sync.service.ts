import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { ListingScoreCalculator } from './listing-score.calculator';
import {
  ListingScoreSnapshotInput,
  ListingScoreStoreService,
  RelativeStrengthSnapshotInput,
} from './listing-score-store.service';

type ListingScoreCurrentRow = {
  listingId: string;
  modelVersion: string;
  gScore: Prisma.Decimal | number | string | null;
  rScore: Prisma.Decimal | number | string | null;
  oScore: Prisma.Decimal | number | string | null;
  vScore: Prisma.Decimal | number | string | null;
  eScore: Prisma.Decimal | number | string | null;
  totalScore: Prisma.Decimal | number | string;
  stance: string;
  breakdown: Prisma.InputJsonValue;
  sourceUpdatedAt: Date | null;
  dataHash: string | null;
  listing: {
    companyId: string;
    symbol: string;
  };
};

@Injectable()
export class ListingScoreSyncService {
  private readonly logger = new Logger(ListingScoreSyncService.name);
  private readonly modelVersion = 'grove-g-r-v4';

  constructor(
    private readonly prisma: PrismaService,
    private readonly listingScoreCalculator: ListingScoreCalculator,
    private readonly listingScoreStoreService: ListingScoreStoreService,
  ) {}

  async syncRelativeStrengthDaily(scoreDate = new Date()): Promise<{
    scoreDate: Date;
    updated: number;
    skipped: number;
    snapshotsSaved: number;
  }> {
    const normalizedScoreDate = this.normalizeDay(scoreDate);
    const universe =
      await this.listingScoreCalculator.calculateRScoreUniverse();
    const groveWeights = await this.listingScoreCalculator.getGroveWeights();
    const activeListings = await this.prisma.listing.findMany({
      where: {
        assetType: 'STOCK',
        company: {
          status: 'ACTIVE',
        },
      },
      select: {
        id: true,
        symbol: true,
        companyId: true,
      },
    });
    const currentRows = await this.prisma.listingScore.findMany({
      select: {
        listingId: true,
        modelVersion: true,
        gScore: true,
        rScore: true,
        oScore: true,
        vScore: true,
        eScore: true,
        totalScore: true,
        stance: true,
        breakdown: true,
        sourceUpdatedAt: true,
        dataHash: true,
        listing: {
          select: {
            companyId: true,
            symbol: true,
          },
        },
      },
    });

    const updates: ListingScoreSnapshotInput[] = [];
    const snapshots: RelativeStrengthSnapshotInput[] = [];
    let skipped = 0;

    for (const row of currentRows as ListingScoreCurrentRow[]) {
      const rResult = universe[row.listingId];
      if (!rResult) {
        skipped++;
        continue;
      }

      updates.push({
        listingId: row.listingId,
        companyId: row.listing.companyId,
        modelVersion: row.modelVersion || this.modelVersion,
        gScore: this.toNumber(row.gScore),
        rScore: rResult.score,
        oScore: this.toNumber(row.oScore),
        vScore: this.toNumber(row.vScore),
        eScore: this.toNumber(row.eScore),
        totalScore: this.toNumber(row.totalScore) ?? 0,
        stance: row.stance,
        breakdown: this.mergeBreakdown(row.breakdown, {
          score: rResult.score,
          maxScore: rResult.maxScore,
          details: rResult.details as unknown as Prisma.InputJsonValue,
        }),
        scoreDate: normalizedScoreDate,
        sourceUpdatedAt: row.sourceUpdatedAt,
        dataHash: row.dataHash,
      });
    }

    for (const listing of activeListings) {
      const rResult = universe[listing.id];
      if (!rResult) {
        continue;
      }

      snapshots.push({
        listingId: listing.id,
        companyId: listing.companyId,
        symbol: listing.symbol,
        scoreDate: normalizedScoreDate,
        modelVersion: this.modelVersion,
        result: rResult,
      });
    }

    await this.listingScoreStoreService.syncMany(updates, {
      groveWeights,
    });
    await this.listingScoreStoreService.upsertRelativeStrengthSnapshots(
      snapshots,
    );

    this.logger.log(
      `Relative strength sync complete. updated=${updates.length} snapshotsSaved=${snapshots.length} skipped=${skipped} scoreDate=${normalizedScoreDate.toISOString()}`,
    );

    return {
      scoreDate: normalizedScoreDate,
      updated: updates.length,
      skipped,
      snapshotsSaved: snapshots.length,
    };
  }

  async syncGrowthForCompany(
    companyId: string,
    scoreDate = new Date(),
  ): Promise<{
    companyId: string;
    updated: boolean;
    scoreDate: Date;
    listingsUpdated?: number;
  }> {
    const normalizedScoreDate = this.normalizeDay(scoreDate);
    const gResult = await this.listingScoreCalculator.calculateGScore(
      companyId,
    );
    const groveWeights = await this.listingScoreCalculator.getGroveWeights();
    const listings = await this.prisma.listing.findMany({
      where: {
        companyId,
        assetType: 'STOCK',
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
        companyId: true,
      },
    });

    if (listings.length === 0) {
      this.logger.warn(
        `Skipping G sync for company ${companyId} because no stock listing was found`,
      );
      return {
        companyId,
        updated: false,
        scoreDate: normalizedScoreDate,
      };
    }

    const currentScores = await this.prisma.listingScore.findMany({
      where: {
        listingId: {
          in: listings.map((listing) => listing.id),
        },
      },
      select: {
        listingId: true,
        modelVersion: true,
        gScore: true,
        rScore: true,
        oScore: true,
        vScore: true,
        eScore: true,
        totalScore: true,
        stance: true,
        breakdown: true,
        sourceUpdatedAt: true,
        dataHash: true,
        listing: {
          select: {
            companyId: true,
          },
        },
      },
    });
    const currentScoreByListingId = new Map(
      (currentScores as ListingScoreCurrentRow[]).map((row) => [
        row.listingId,
        row,
      ]),
    );

    const inputs = await Promise.all(
      listings.map(async (listing) => {
        const currentScore = currentScoreByListingId.get(listing.id) ?? null;

        const baseBreakdown = currentScore
          ? this.mergeBreakdown(currentScore.breakdown, {
              score: gResult.score,
              maxScore: gResult.maxScore,
              details: gResult.details as unknown as Prisma.InputJsonValue,
            })
          : this.createDefaultBreakdown(gResult);

        return {
          listingId: listing.id,
          companyId,
          modelVersion: currentScore?.modelVersion || this.modelVersion,
          gScore: gResult.score,
          rScore: this.toNumber(currentScore?.rScore),
          oScore: this.toNumber(currentScore?.oScore),
          vScore: this.toNumber(currentScore?.vScore),
          eScore: this.toNumber(currentScore?.eScore),
          totalScore: this.toNumber(currentScore?.totalScore) ?? 0,
          stance: currentScore?.stance,
          breakdown: baseBreakdown,
          scoreDate: normalizedScoreDate,
          sourceUpdatedAt: currentScore?.sourceUpdatedAt ?? null,
          dataHash: currentScore?.dataHash ?? null,
        } satisfies ListingScoreSnapshotInput;
      }),
    );

    await this.listingScoreStoreService.syncMany(inputs, {
      groveWeights,
    });

    this.logger.log(
      `Growth sync complete for company ${companyId} listings=${listings.length} scoreDate=${normalizedScoreDate.toISOString()}`,
    );

    return {
      companyId,
      updated: true,
      listingsUpdated: listings.length,
      scoreDate: normalizedScoreDate,
    };
  }

  async syncGrowthForAllCompanies(scoreDate = new Date()): Promise<{
    scoreDate: Date;
    companiesProcessed: number;
    updated: number;
    skipped: number;
  }> {
    const companies = await this.prisma.company.findMany({
      select: {
        id: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    let updated = 0;
    let skipped = 0;

    for (const company of companies) {
      const result = await this.syncGrowthForCompany(
        company.id,
        scoreDate,
      );
      if (result.updated) {
        updated++;
      } else {
        skipped++;
      }
    }

    return {
      scoreDate: this.normalizeDay(scoreDate),
      companiesProcessed: companies.length,
      updated,
      skipped,
    };
  }

  private normalizeDay(value: Date) {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }

  private toNumber(value: Prisma.Decimal | number | string | null | undefined) {
    if (value === null) {
      return null;
    }

    return Number(value);
  }

  private mergeBreakdown(
    currentBreakdown: Prisma.InputJsonValue,
    rSnapshot: {
      score: number;
      maxScore: number;
      details: Prisma.InputJsonValue;
    },
  ): Prisma.InputJsonValue {
    const base =
      currentBreakdown && typeof currentBreakdown === 'object' && !Array.isArray(currentBreakdown)
        ? { ...(currentBreakdown as Record<string, unknown>) }
        : {};

    return {
      ...base,
      r: {
        score: rSnapshot.score,
        maxScore: rSnapshot.maxScore,
        details: rSnapshot.details,
      },
    } as unknown as Prisma.InputJsonValue;
  }

  private createDefaultBreakdown(
    gResult: Awaited<ReturnType<ListingScoreCalculator['calculateGScore']>>,
  ): Prisma.InputJsonValue {
    return {
      g: {
        score: gResult.score,
        maxScore: gResult.maxScore,
        details: gResult.details,
      },
      r: {
        score: null,
        maxScore: 0,
        details: null,
        status: 'not_implemented',
      },
      o: {
        score: null,
        maxScore: 0,
        details: null,
        status: 'not_implemented',
      },
      v: {
        score: null,
        maxScore: 0,
        details: null,
        status: 'not_implemented',
      },
      e: {
        score: null,
        maxScore: 0,
        details: null,
        status: 'not_implemented',
      },
    } as unknown as Prisma.InputJsonValue;
  }
}
