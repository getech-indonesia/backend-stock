import { Injectable, Logger } from '@nestjs/common';
import { PeriodType, Prisma } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';

type QuarterLike = {
  fiscalYear: number;
  fiscalQuarter: number | null;
  period: PeriodType;
  eps: Prisma.Decimal | null;
  netIncome: Prisma.Decimal | null;
};

@Injectable()
export class DividendEnrichSyncService {
  private readonly logger = new Logger(DividendEnrichSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  async enrichAll(): Promise<{
    companiesProcessed: number;
    dividendsScanned: number;
    dividendsUpdated: number;
    skippedMissingDependency: number;
  }> {
    const companies = await this.prisma.company.findMany({
      select: {
        id: true,
        listings: {
          select: { id: true, symbol: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    let dividendsScanned = 0;
    let dividendsUpdated = 0;
    let skippedMissingDependency = 0;

    for (const company of companies) {
      const listing = company.listings[0];
      if (!listing) {
        continue;
      }

      const dividends = await this.prisma.dividend.findMany({
        where: { companyId: company.id },
        orderBy: [{ fiscalYear: 'desc' }, { createdAt: 'desc' }],
      });

      if (dividends.length === 0) {
        continue;
      }

      const [quarterly, annual] = await Promise.all([
        this.prisma.incomeStatement.findMany({
          where: {
            companyId: company.id,
            period: {
              in: [PeriodType.Q1, PeriodType.Q2, PeriodType.Q3, PeriodType.Q4],
            },
          },
          select: {
            fiscalYear: true,
            fiscalQuarter: true,
            period: true,
            eps: true,
            netIncome: true,
          },
        }),
        this.prisma.incomeStatement.findMany({
          where: {
            companyId: company.id,
            period: PeriodType.ANNUAL,
          },
          select: {
            fiscalYear: true,
            fiscalQuarter: true,
            period: true,
            eps: true,
            netIncome: true,
          },
        }),
      ]);

      const normalizedQuarterly = this.buildQuarterlyWithDerivedQ4(quarterly, annual);
      const sharesSnapshots = await this.prisma.sharesData.findMany({
        where: { companyId: company.id },
        orderBy: { date: 'asc' },
        select: { date: true, sharesOutstanding: true },
      });

      for (const dividend of dividends) {
        dividendsScanned++;

        const anchorDate =
          dividend.recordDate ??
          dividend.exDividendDate ??
          dividend.paymentDate ??
          dividend.declaredDate ??
          new Date(Date.UTC(dividend.fiscalYear, 11, 31));

        const [pricePoint, sharesPoint] = await Promise.all([
          this.prisma.stockPrice.findFirst({
            where: {
              listingId: listing.id,
              date: { lte: anchorDate },
            },
            orderBy: { date: 'desc' },
            select: { close: true },
          }),
          this.findNearestSharesSnapshot(sharesSnapshots, anchorDate),
        ]);

        const epsTtm = this.calculateEpsTtm(
          normalizedQuarterly,
          sharesPoint?.sharesOutstanding ?? null,
        );
        const nextDps =
          dividend.dps ??
          this.calculateDpsFromCashDividendTotal(
            dividend.cashDividendTotal,
            sharesPoint?.sharesOutstanding ?? null,
          );

        const nextPayoutRatio =
          dividend.payoutRatio ??
          (nextDps && epsTtm && !epsTtm.isZero()
            ? nextDps.div(epsTtm).mul(100)
            : null);
        const nextDividendYield =
          dividend.dividendYield ??
          (nextDps && pricePoint && !pricePoint.close.isZero()
            ? nextDps.div(pricePoint.close).mul(100)
            : null);

        if (!nextDps && !nextPayoutRatio && !nextDividendYield) {
          skippedMissingDependency++;
          continue;
        }

        if (
          dividend.dps?.equals(nextDps ?? dividend.dps) &&
          dividend.payoutRatio?.equals(nextPayoutRatio ?? dividend.payoutRatio) &&
          dividend.dividendYield?.equals(nextDividendYield ?? dividend.dividendYield)
        ) {
          continue;
        }

        await this.prisma.dividend.update({
          where: { id: dividend.id },
          data: {
            ...(nextDps
              ? {
                  dps: nextDps.toDecimalPlaces(4),
                }
              : {}),
            payoutRatio: nextPayoutRatio ? nextPayoutRatio.toDecimalPlaces(4) : null,
            dividendYield: nextDividendYield ? nextDividendYield.toDecimalPlaces(4) : null,
          },
        });
        dividendsUpdated++;
      }

      this.logger.log(
        `Dividend enrich processed ${listing.symbol} (${company.id}) with ${dividends.length} dividend record(s).`,
      );
    }

    const summary = {
      companiesProcessed: companies.length,
      dividendsScanned,
      dividendsUpdated,
      skippedMissingDependency,
    };

    this.logger.log(
      `Dividend enrich completed: companies=${summary.companiesProcessed}, scanned=${summary.dividendsScanned}, updated=${summary.dividendsUpdated}, skipped=${summary.skippedMissingDependency}`,
    );

    return summary;
  }

  private buildQuarterlyWithDerivedQ4(
    quarterly: QuarterLike[],
    annual: QuarterLike[],
  ): QuarterLike[] {
    const records = [...quarterly];
    const q3ByYear = new Map<number, QuarterLike>();
    const hasQ4ByYear = new Set<number>();

    for (const row of quarterly) {
      if (row.period === PeriodType.Q3) {
        q3ByYear.set(row.fiscalYear, row);
      }
      if (row.period === PeriodType.Q4) {
        hasQ4ByYear.add(row.fiscalYear);
      }
    }

    for (const annualRow of annual) {
      if (hasQ4ByYear.has(annualRow.fiscalYear)) {
        continue;
      }
      const q3 = q3ByYear.get(annualRow.fiscalYear);
      if (!q3) {
        continue;
      }
      records.push({
        fiscalYear: annualRow.fiscalYear,
        fiscalQuarter: 4,
        period: PeriodType.Q4,
        eps: this.subtractDecimal(annualRow.eps, q3.eps),
        netIncome: this.subtractDecimal(annualRow.netIncome, q3.netIncome),
      });
    }

    return records.sort((a, b) => {
      if (a.fiscalYear !== b.fiscalYear) {
        return a.fiscalYear - b.fiscalYear;
      }
      return (a.fiscalQuarter ?? 0) - (b.fiscalQuarter ?? 0);
    });
  }

  private calculateEpsTtm(
    quarterly: QuarterLike[],
    sharesOutstanding: bigint | null,
  ): Prisma.Decimal | null {
    const latest4 = quarterly.slice(-4);
    if (latest4.length < 4) {
      return null;
    }

    const epsFromRows = latest4.reduce<Prisma.Decimal | null>((acc, row) => {
      if (!row.eps) {
        return acc;
      }
      if (!acc) {
        return row.eps;
      }
      return acc.add(row.eps);
    }, null);

    if (epsFromRows && !epsFromRows.isZero()) {
      return epsFromRows;
    }

    if (!sharesOutstanding || sharesOutstanding <= 0n) {
      return null;
    }

    const netIncomeTtm = latest4.reduce<Prisma.Decimal | null>((acc, row) => {
      if (!row.netIncome) {
        return acc;
      }
      if (!acc) {
        return row.netIncome;
      }
      return acc.add(row.netIncome);
    }, null);

    if (!netIncomeTtm) {
      return null;
    }

    return netIncomeTtm.div(new Prisma.Decimal(sharesOutstanding.toString()));
  }

  private findNearestSharesSnapshot(
    sharesSnapshots: Array<{ date: Date; sharesOutstanding: bigint }>,
    anchorDate: Date,
  ) {
    if (sharesSnapshots.length === 0) {
      return null;
    }

    const anchorTime = anchorDate.getTime();
    let nearest = sharesSnapshots[0];
    let smallestDiff = Math.abs(nearest.date.getTime() - anchorTime);

    for (let i = 1; i < sharesSnapshots.length; i += 1) {
      const row = sharesSnapshots[i];
      const diff = Math.abs(row.date.getTime() - anchorTime);
      if (diff < smallestDiff) {
        smallestDiff = diff;
        nearest = row;
      }
    }

    return nearest;
  }

  private subtractDecimal(
    minuend: Prisma.Decimal | null,
    subtrahend: Prisma.Decimal | null,
  ): Prisma.Decimal | null {
    if (!minuend || !subtrahend) {
      return null;
    }

    return minuend.sub(subtrahend);
  }

  private calculateDpsFromCashDividendTotal(
    cashDividendTotal: Prisma.Decimal | null,
    sharesOutstanding: bigint | null,
  ): Prisma.Decimal | null {
    if (!cashDividendTotal || !sharesOutstanding || sharesOutstanding <= 0n) {
      return null;
    }

    return cashDividendTotal.div(
      new Prisma.Decimal(sharesOutstanding.toString()),
    );
  }
}
