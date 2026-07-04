import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';

import { PrismaService } from '../../../prisma/prisma.service';

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
  private readonly modelVersion = 'grove-g-v1';

  constructor(private readonly prisma: PrismaService) {}

  async syncMany(inputs: ListingScoreSnapshotInput[]) {
    return Promise.all(inputs.map((input) => this.syncOne(input)));
  }

  async syncOne(input: ListingScoreSnapshotInput) {
    const sourceSnapshot = await this.buildSourceSnapshot(input.companyId);
    const now = new Date();

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
        totalScore: new Prisma.Decimal(input.totalScore),
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
        totalScore: new Prisma.Decimal(input.totalScore),
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
      sharesDataLatest,
      sharesDataCount,
      ajaibStockMarketLatest,
      ajaibStockMarketCount,
    ] = await Promise.all([
      this.findLatestTimestamp(
        this.prisma.incomeStatement,
        { companyId },
        'updatedAt',
      ),
      this.prisma.incomeStatement.count({ where: { companyId } }),
      this.findLatestTimestamp(
        this.prisma.balanceSheet,
        { companyId },
        'updatedAt',
      ),
      this.prisma.balanceSheet.count({ where: { companyId } }),
      this.findLatestTimestamp(
        this.prisma.sharesData,
        { companyId },
        'createdAt',
      ),
      this.prisma.sharesData.count({ where: { companyId } }),
      this.findLatestTimestamp(
        this.prisma.ajaibStockMarket,
        { listing: { companyId } },
        'updatedAt',
      ),
      this.prisma.ajaibStockMarket.count({
        where: {
          listing: { companyId },
        },
      }),
    ]);

    const sourceUpdatedAt = this.maxDate([
      incomeStatementLatest?.updatedAt ?? null,
      balanceSheetLatest?.updatedAt ?? null,
      sharesDataLatest?.createdAt ?? null,
      ajaibStockMarketLatest?.updatedAt ?? null,
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
      sharesData: {
        count: sharesDataCount,
        updatedAt: sharesDataLatest?.createdAt?.toISOString() ?? null,
      },
      ajaibStockMarket: {
        count: ajaibStockMarketCount,
        updatedAt: ajaibStockMarketLatest?.updatedAt?.toISOString() ?? null,
      },
    };

    return {
      sourceUpdatedAt,
      dataHash: createHash('sha256')
        .update(JSON.stringify(fingerprint))
        .digest('hex'),
    };
  }

  private async findLatestTimestamp(
    model: any,
    where?: Record<string, unknown>,
    timestampField: 'updatedAt' | 'createdAt' | 'date' = 'updatedAt',
  ): Promise<{ updatedAt?: Date; createdAt?: Date; date?: Date } | null> {
    return model.findFirst({
      where,
      orderBy: {
        [timestampField]: 'desc',
      },
      select: {
        [timestampField]: true,
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
