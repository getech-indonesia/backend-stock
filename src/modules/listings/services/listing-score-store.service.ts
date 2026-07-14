import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';

import { PrismaService } from '../../../prisma/prisma.service';
import { ListingScoreCalculator } from './listing-score.calculator';

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
  stance: string;
  breakdown: Prisma.InputJsonValue;
}

@Injectable()
export class ListingScoreStoreService {
  private readonly modelVersion = 'grove-g-r-v4';

  constructor(
    private readonly prisma: PrismaService,
    private readonly listingScoreCalculator: ListingScoreCalculator,
  ) {}

  async syncMany(inputs: ListingScoreSnapshotInput[]) {
    return Promise.all(inputs.map((input) => this.syncOne(input)));
  }

  async syncOne(input: ListingScoreSnapshotInput) {
    const sourceSnapshot = await this.buildSourceSnapshot(input.companyId);
    const now = new Date();
    const groveWeights = await this.listingScoreCalculator.getGroveWeights();
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

    return this.prisma.listingScore.upsert({
      where: {
        listingId: input.listingId,
      },
      create: {
        listingId: input.listingId,
        modelVersion: input.modelVersion || this.modelVersion,
        gScore: this.toDecimal(input.gScore),
        rScore: this.toDecimal(input.rScore),
        oScore: this.toDecimal(input.oScore),
        vScore: this.toDecimal(input.vScore),
        eScore: this.toDecimal(input.eScore),
        totalScore: new Prisma.Decimal(totalScore),
        stance: input.stance,
        breakdown: input.breakdown,
        sourceUpdatedAt: sourceSnapshot.sourceUpdatedAt,
        dataHash: sourceSnapshot.dataHash,
        calculatedAt: now,
      },
      update: {
        modelVersion: input.modelVersion || this.modelVersion,
        gScore: this.toDecimal(input.gScore),
        rScore: this.toDecimal(input.rScore),
        oScore: this.toDecimal(input.oScore),
        vScore: this.toDecimal(input.vScore),
        eScore: this.toDecimal(input.eScore),
        totalScore: new Prisma.Decimal(totalScore),
        stance: input.stance,
        breakdown: input.breakdown,
        sourceUpdatedAt: sourceSnapshot.sourceUpdatedAt,
        dataHash: sourceSnapshot.dataHash,
        calculatedAt: now,
      },
    });
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

  private toDecimal(value: number | null) {
    if (value === null || value === undefined) {
      return null;
    }

    return new Prisma.Decimal(value);
  }
}
