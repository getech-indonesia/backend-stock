import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';

import { PrismaService } from '../../../prisma/prisma.service';
import {
  ListingScoreCalculator,
  RelativeStrengthScoreResult,
} from './listing-score.calculator';

export interface ListingScoreSnapshotInput {
  listingId: string;
  companyId: string;
  modelVersion: string;
  gScore: number | null;
  rScore: number | null;
  oScore: number | null;
  vScore: number | null;
  eScore: number | null;
  totalScore: number;
  stance?: string;
  breakdown: Prisma.InputJsonValue;
  scoreDate?: Date;
  sourceUpdatedAt?: Date | null;
  dataHash?: string | null;
}

export interface RelativeStrengthSnapshotInput {
  listingId: string;
  companyId: string;
  symbol: string;
  scoreDate?: Date;
  modelVersion: string;
  result: RelativeStrengthScoreResult;
}

@Injectable()
export class ListingScoreStoreService {
  private readonly modelVersion = 'grove-g-r-v4';

  constructor(
    private readonly prisma: PrismaService,
    private readonly listingScoreCalculator: ListingScoreCalculator,
  ) {}

  async syncMany(
    inputs: ListingScoreSnapshotInput[],
    options?: {
      groveWeights?: {
        weightG: number;
        weightR: number;
        weightO: number;
        weightV: number;
        weightE: number;
      };
    },
  ) {
    return Promise.all(inputs.map((input) => this.syncOne(input, options)));
  }

  async syncOne(
    input: ListingScoreSnapshotInput,
    options?: {
      groveWeights?: {
        weightG: number;
        weightR: number;
        weightO: number;
        weightV: number;
        weightE: number;
      };
    },
  ) {
    const now = new Date();
    const scoreDate = this.normalizeDay(input.scoreDate ?? now);
    const sourceSnapshot =
      input.sourceUpdatedAt != null && input.dataHash != null
        ? {
            sourceUpdatedAt: input.sourceUpdatedAt ?? null,
            dataHash: input.dataHash ?? null,
          }
        : await this.buildSourceSnapshot(input.companyId);
    const groveWeights =
      options?.groveWeights ?? (await this.listingScoreCalculator.getGroveWeights());
    const totalScore = await this.listingScoreCalculator.calculateGroveWeightedTotal(
      {
        gScore: input.gScore,
        rScore: input.rScore,
        oScore: input.oScore,
        vScore: input.vScore,
        eScore: input.eScore,
      },
      groveWeights,
    );
    const stance = input.stance ?? this.resolveStance(totalScore);
    const modelVersion = input.modelVersion || this.modelVersion;
    const listingScorePayload = {
      modelVersion,
      gScore: this.toDecimal(input.gScore),
      rScore: this.toDecimal(input.rScore),
      oScore: this.toDecimal(input.oScore),
      vScore: this.toDecimal(input.vScore),
      eScore: this.toDecimal(input.eScore),
      totalScore: new Prisma.Decimal(totalScore),
      stance,
      breakdown: input.breakdown,
      sourceUpdatedAt: sourceSnapshot.sourceUpdatedAt,
      dataHash: sourceSnapshot.dataHash,
      calculatedAt: now,
    };

    const currentScore = await this.prisma.listingScore.upsert({
      where: {
        listingId: input.listingId,
      },
      create: {
        listingId: input.listingId,
        ...listingScorePayload,
      },
      update: {
        ...listingScorePayload,
      },
    });

    await this.prisma.listingScoreSnapshot.upsert({
      where: {
        listingId_scoreDate_modelVersion: {
          listingId: input.listingId,
          scoreDate,
          modelVersion,
        },
      },
      create: {
        listingId: input.listingId,
        scoreDate,
        ...listingScorePayload,
      },
      update: {
        scoreDate,
        ...listingScorePayload,
      },
    });

    return currentScore;
  }

  async upsertRelativeStrengthSnapshots(
    inputs: RelativeStrengthSnapshotInput[],
  ) {
    if (inputs.length === 0) {
      return [];
    }

    return Promise.all(
      inputs.map((input) => this.upsertRelativeStrengthSnapshot(input)),
    );
  }

  async getLatestSnapshot(companyId: string) {
    return this.buildSourceSnapshot(companyId);
  }

  private async buildSourceSnapshot(companyId: string) {
    const [
      incomeStatementLatest,
      incomeStatementCount,
      balanceSheetLatest,
      balanceSheetCount,
      cashFlowStatementLatest,
      cashFlowStatementCount,
    ] = await Promise.all([
      this.findLatestUpdatedAt(this.prisma.incomeStatement, { companyId }),
      this.prisma.incomeStatement.count({ where: { companyId } }),
      this.findLatestUpdatedAt(this.prisma.balanceSheet, { companyId }),
      this.prisma.balanceSheet.count({ where: { companyId } }),
      this.findLatestUpdatedAt(this.prisma.cashFlowStatement, { companyId }),
      this.prisma.cashFlowStatement.count({ where: { companyId } }),
    ]);

    const sourceUpdatedAt = this.maxDate([
      incomeStatementLatest?.updatedAt ?? null,
      balanceSheetLatest?.updatedAt ?? null,
      cashFlowStatementLatest?.updatedAt ?? null,
    ]);

    const fingerprint = {
      companyId,
      incomeStatement: {
        count: incomeStatementCount,
        updatedAt: incomeStatementLatest?.updatedAt?.toISOString() ?? null,
      },
      balanceSheet: {
        count: balanceSheetCount,
        updatedAt: balanceSheetLatest?.updatedAt?.toISOString() ?? null,
      },
      cashFlowStatement: {
        count: cashFlowStatementCount,
        updatedAt: cashFlowStatementLatest?.updatedAt?.toISOString() ?? null,
      },
    };

    return {
      sourceUpdatedAt,
      dataHash: createHash('sha256')
        .update(JSON.stringify(fingerprint))
        .digest('hex'),
    };
  }

  private findLatestUpdatedAt(
    model: {
      findFirst(args: {
        where?: Record<string, unknown>;
        orderBy: {
          updatedAt: 'desc';
        };
        select: {
          updatedAt: true;
        };
      }): Promise<{ updatedAt: Date } | null>;
    },
    where?: Record<string, unknown>,
  ): Promise<{ updatedAt: Date } | null> {
    return model.findFirst({
      where,
      orderBy: {
        updatedAt: 'desc',
      },
      select: {
        updatedAt: true,
      },
    });
  }

  private maxDate(values: Array<Date | null>) {
    const filtered = values.filter(
      (value): value is Date => value instanceof Date,
    );
    if (filtered.length === 0) {
      return null;
    }

    return new Date(Math.max(...filtered.map((value) => value.getTime())));
  }

  private normalizeDay(value: Date) {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }

  private async upsertRelativeStrengthSnapshot(
    input: RelativeStrengthSnapshotInput,
  ) {
    const scoreDate = this.normalizeDay(input.scoreDate ?? new Date());
    const r1 = input.result.details.r1;
    const r2 = input.result.details.r2;
    const r3 = input.result.details.r3;

    return this.prisma.relativeStrengthSnapshot.upsert({
      where: {
        listingId_scoreDate_modelVersion: {
          listingId: input.listingId,
          scoreDate,
          modelVersion: input.modelVersion,
        },
      },
      create: {
        listingId: input.listingId,
        companyId: input.companyId,
        symbol: input.symbol,
        scoreDate,
        modelVersion: input.modelVersion,
        score: new Prisma.Decimal(input.result.score),
        maxScore: new Prisma.Decimal(input.result.maxScore),
        rank: r1.currentRank,
        totalRanked: r1.totalRanked,
        rsRating: this.toDecimal(r1.rsRating),
        details: input.result.details as unknown as Prisma.InputJsonValue,
        rawPerformance: this.toDecimal(r1.rawPerformance),
        roc63: this.toDecimal(r1.roc63),
        roc126: this.toDecimal(r1.roc126),
        roc189: this.toDecimal(r1.roc189),
        roc252: this.toDecimal(r1.roc252),
        close: this.toDecimal(r2.close),
        high52: this.toDecimal(r2.high52),
        low52: this.toDecimal(r3.low52),
        distanceHighPct: this.toDecimal(r2.distanceHighPct),
        distanceLowPct: this.toDecimal(r3.distanceLowPct),
        sourcePeriods: input.result.details.r1.sourcePeriods as unknown as Prisma.InputJsonValue,
        calculatedAt: new Date(),
      },
      update: {
        companyId: input.companyId,
        symbol: input.symbol,
        score: new Prisma.Decimal(input.result.score),
        maxScore: new Prisma.Decimal(input.result.maxScore),
        rank: r1.currentRank,
        totalRanked: r1.totalRanked,
        rsRating: this.toDecimal(r1.rsRating),
        details: input.result.details as unknown as Prisma.InputJsonValue,
        rawPerformance: this.toDecimal(r1.rawPerformance),
        roc63: this.toDecimal(r1.roc63),
        roc126: this.toDecimal(r1.roc126),
        roc189: this.toDecimal(r1.roc189),
        roc252: this.toDecimal(r1.roc252),
        close: this.toDecimal(r2.close),
        high52: this.toDecimal(r2.high52),
        low52: this.toDecimal(r3.low52),
        distanceHighPct: this.toDecimal(r2.distanceHighPct),
        distanceLowPct: this.toDecimal(r3.distanceLowPct),
        sourcePeriods: input.result.details.r1.sourcePeriods as unknown as Prisma.InputJsonValue,
        calculatedAt: new Date(),
      },
    });
  }

  private resolveStance(totalScore: number) {
    if (totalScore >= 70) {
      return 'Overweight';
    }

    if (totalScore >= 55) {
      return 'Neutral';
    }

    return 'Underweight';
  }

  private toDecimal(value: number | null) {
    if (value === null || value === undefined) {
      return null;
    }

    return new Prisma.Decimal(value);
  }
}
