import { Injectable } from '@nestjs/common';
import { PeriodType, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { FindStocksQueryDto } from './dto/find-stocks-query.dto';

type QuarterlyIncomeStatementLike = {
  companyId: string;
  period: PeriodType;
  fiscalYear: number;
  fiscalQuarter: number | null;
  periodEndDate: Date;
  revenue: Prisma.Decimal | null;
  cogs: Prisma.Decimal | null;
  grossProfit: Prisma.Decimal | null;
  operatingExpenses: Prisma.Decimal | null;
  ebit: Prisma.Decimal | null;
  incomeTaxExpense: Prisma.Decimal | null;
  netIncome: Prisma.Decimal | null;
};

type AnnualIncomeStatementLike = {
  companyId: string;
  period: PeriodType;
  fiscalYear: number;
  fiscalQuarter: number | null;
  periodEndDate: Date;
  revenue: Prisma.Decimal | null;
  cogs: Prisma.Decimal | null;
  grossProfit: Prisma.Decimal | null;
  operatingExpenses: Prisma.Decimal | null;
  ebit: Prisma.Decimal | null;
  incomeTaxExpense: Prisma.Decimal | null;
  netIncome: Prisma.Decimal | null;
};

@Injectable()
export class StocksService {
  constructor(
    private readonly prisma: PrismaService,
  ) { }

  async findAllSectors() {
    return this.prisma.sector.findMany({
      orderBy: {
        name: 'asc',
      },
      include: {
        industries: {
          orderBy: {
            name: 'asc',
          },
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async findAll(
    query: FindStocksQueryDto,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const keyword = query.q?.trim();
    const sector = query.sector?.trim();
    const isAllSector = sector?.toLowerCase() === 'all';
    const filters: Prisma.ListingWhereInput[] = [];

    if (keyword) {
      filters.push({
        OR: [
          {
            symbol: {
              contains: keyword,
              mode: 'insensitive',
            },
          },
          {
            company: {
              OR: [
                {
                  displayName: {
                    contains: keyword,
                    mode: 'insensitive',
                  },
                },
                {
                  legalName: {
                    contains: keyword,
                    mode: 'insensitive',
                  },
                },
              ],
            },
          },
        ],
      });
    }

    if (sector && !isAllSector) {
      filters.push({
        company: {
          industry: {
            sector: {
              name: {
                equals: sector,
                mode: 'insensitive',
              },
            },
          },
        },
      });
    }

    const where =
      filters.length > 0
        ? {
          AND: filters,
        }
        : undefined;

    const [items, total] =
      await Promise.all([
        this.prisma.listing.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: {
            symbol: 'asc',
          },
          include: {
            exchange: true,
            stockPrices: {
              take: 2,
              orderBy: {
                date: 'desc',
              },
            },
            ajaibStockMarket: {
              select: {
                marketCap: true,
              },
            },
            company: {
              include: {
                country: true,
                industry: {
                  include: {
                    sector: true,
                  },
                },
              },
            },
          },
        }),
        this.prisma.listing.count({ where }),
      ]);

    return {
      items: items.map((item) => {
        return this.mapListingWithMetrics(item);
      }),
      pagination: {
        page,
        pageSize,
        total,
        totalPages:
          total === 0
            ? 0
            : Math.ceil(total / pageSize),
      },
    };
  }

  async findOneBySymbol(symbol: string) {
    const listing = await this.prisma.listing.findFirst({
      where: {
        symbol: {
          equals: symbol,
          mode: 'insensitive',
        },
      },
      include: {
        exchange: true,
        stockPrices: {
          take: 2,
          orderBy: {
            date: 'desc',
          },
        },
        ajaibStockMarket: {
          select: {
            marketCap: true,
          },
        },
        company: {
          include: {
            country: true,
            industry: {
              include: {
                sector: true,
              },
            },
          },
        },
      },
    });

    if (!listing) {
      return null;
    }

    return this.mapListingWithMetrics(listing);
  }

  async findFinancialStatementsBySymbol(symbol: string) {
    const listing = await this.prisma.listing.findFirst({
      where: {
        symbol: {
          equals: symbol,
          mode: 'insensitive',
        },
      },
      include: {
        company: {
          include: {
            industry: {
              include: {
                sector: true,
              },
            },
          },
        },
      },
    });

    if (!listing) {
      return null;
    }

    const quarterlyStatements = await this.prisma.incomeStatement.findMany({
      where: {
        companyId: listing.companyId,
        period: {
          in: [
            PeriodType.Q1,
            PeriodType.Q2,
            PeriodType.Q3,
            PeriodType.Q4,
          ],
        },
      },
      orderBy: [
        {
          fiscalYear: 'desc',
        },
        {
          fiscalQuarter: 'desc',
        },
      ],
    });

    const annualStatements = await this.prisma.incomeStatement.findMany({
      where: {
        companyId: listing.companyId,
        period: PeriodType.ANNUAL,
      },
      orderBy: [
        {
          fiscalYear: 'desc',
        },
      ],
    });

    const statements = this.buildQuarterlyStatementsWithDerivedQ4(
      quarterlyStatements,
      annualStatements,
    ).slice(0, 8);

    if (statements.length === 0) {
      return null;
    }

    const statementsChronological = statements.slice().reverse();

    const periods = statementsChronological
      .map((statement) => ({
        key: `${statement.fiscalYear}-Q${statement.fiscalQuarter}`,
        label: this.formatPeriodLabel(
          statement.period,
          statement.fiscalYear,
          statement.fiscalQuarter,
        ),
        period: statement.period,
        fiscalYear: statement.fiscalYear,
        fiscalQuarter: statement.fiscalQuarter,
        periodEndDate: statement.periodEndDate,
      }));

    const buildRowValues = (
      picker: (statement: QuarterlyIncomeStatementLike) => Prisma.Decimal | null,
    ) =>
      statementsChronological
        .map((statement) => {
          const raw = picker(statement);
          return {
            raw: raw?.toString() ?? null,
            billion: this.toBillionString(raw),
          };
        });

    const tableRows = [
      {
        key: 'revenue',
        label: 'Total Pendapatan',
        values: buildRowValues((statement) => statement.revenue),
      },
      {
        key: 'cogs',
        label: 'Beban Pokok Penjualan',
        values: buildRowValues((statement) => statement.cogs),
      },
      {
        key: 'grossProfit',
        label: 'Laba Kotor',
        values: buildRowValues((statement) => statement.grossProfit),
      },
      {
        key: 'operatingExpenses',
        label: 'Total Beban Usaha',
        values: buildRowValues((statement) => statement.operatingExpenses),
      },
      {
        key: 'ebit',
        label: 'Laba Usaha (EBIT)',
        values: buildRowValues((statement) => statement.ebit),
      },
      {
        key: 'incomeTaxExpense',
        label: 'Beban Pajak Penghasilan',
        values: buildRowValues((statement) => statement.incomeTaxExpense),
      },
      {
        key: 'netIncome',
        label: 'Laba Bersih Tahun Berjalan',
        values: buildRowValues((statement) => statement.netIncome),
      },
    ];

    return {
      listing: {
        id: listing.id,
        symbol: listing.symbol,
      },
      company: {
        id: listing.company.id,
        legalName: listing.company.legalName,
        displayName: listing.company.displayName,
      },
      sector: {
        name: listing.company.industry.sector.name,
      },
      industry: {
        name: listing.company.industry.name,
      },
      report: {
        unit: 'BILLION_IDR',
        periods,
        chart: {
          revenue: buildRowValues((statement) => statement.revenue),
          netIncome: buildRowValues((statement) => statement.netIncome),
        },
        table: {
          rows: tableRows,
        },
      },
    };
  }

  private buildQuarterlyStatementsWithDerivedQ4(
    quarterlyStatements: QuarterlyIncomeStatementLike[],
    annualStatements: AnnualIncomeStatementLike[],
  ): QuarterlyIncomeStatementLike[] {
    const statements = [...quarterlyStatements];
    const q3ByYear = new Map<number, QuarterlyIncomeStatementLike>();
    const hasQ4ByYear = new Set<number>();

    for (const statement of quarterlyStatements) {
      if (statement.period === PeriodType.Q3) {
        q3ByYear.set(statement.fiscalYear, statement);
      }

      if (statement.period === PeriodType.Q4) {
        hasQ4ByYear.add(statement.fiscalYear);
      }
    }

    for (const annual of annualStatements) {
      if (hasQ4ByYear.has(annual.fiscalYear)) {
        continue;
      }

      const q3 = q3ByYear.get(annual.fiscalYear);
      if (!q3) {
        continue;
      }

      statements.push({
        companyId: annual.companyId,
        period: PeriodType.Q4,
        fiscalYear: annual.fiscalYear,
        fiscalQuarter: 4,
        periodEndDate: annual.periodEndDate,
        revenue: this.subtractDecimal(annual.revenue, q3.revenue),
        cogs: this.subtractDecimal(annual.cogs, q3.cogs),
        grossProfit: this.subtractDecimal(annual.grossProfit, q3.grossProfit),
        operatingExpenses: this.subtractDecimal(
          annual.operatingExpenses,
          q3.operatingExpenses,
        ),
        ebit: this.subtractDecimal(annual.ebit, q3.ebit),
        incomeTaxExpense: this.subtractDecimal(
          annual.incomeTaxExpense,
          q3.incomeTaxExpense,
        ),
        netIncome: this.subtractDecimal(annual.netIncome, q3.netIncome),
      });
    }

    return statements.sort((a, b) => {
      if (a.fiscalYear !== b.fiscalYear) {
        return b.fiscalYear - a.fiscalYear;
      }

      const quarterA = a.fiscalQuarter ?? 0;
      const quarterB = b.fiscalQuarter ?? 0;
      return quarterB - quarterA;
    });
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

  private mapListingWithMetrics(item: any) {
    const latestStockPrice = item.stockPrices?.[0];
    const previousStockPrice = item.stockPrices?.[1];
    const priceComparison = this.buildPriceComparison(
      latestStockPrice,
      previousStockPrice,
    );

    return {
      listing: {
        id: item.id,
        symbol: item.symbol,
        assetType: item.assetType,
        isin: item.isin,
        cusip: item.cusip,
      },
      exchange: {
        code: item.exchange.code,
        name: item.exchange.name,
        timezone: item.exchange.timezone,
        exchangeType: item.exchange.exchangeType,
      },
      company: {
        id: item.company.id,
        legalName: item.company.legalName,
        displayName: item.company.displayName,
        description: item.company.description,
        website: item.company.website,
        logoUrl: item.company.logoUrl,
        ceo: item.company.ceo,
        foundedYear: item.company.foundedYear,
        employeeCount: item.company.employeeCount,
        headquarters: item.company.headquarters,
        status: item.company.status,
      },
      country: item.company.country,
      sector: {
        name: item.company.industry.sector.name,
      },
      industry: {
        name: item.company.industry.name,
      },
      latestStockPrice:
        latestStockPrice
          ? {
            date: latestStockPrice.date,
            open: latestStockPrice.open.toString(),
            high: latestStockPrice.high.toString(),
            low: latestStockPrice.low.toString(),
            close: latestStockPrice.close.toString(),
            adjClose: latestStockPrice.adjClose?.toString() ?? null,
            volume: latestStockPrice.volume.toString(),
            value: latestStockPrice.value?.toString() ?? null,
          }
          : null,
      priceComparison,
      marketCap: item.ajaibStockMarket?.marketCap.toString() ?? null,
    };
  }

  private buildPriceComparison(
    latestStockPrice?: {
      date: Date;
      close: Prisma.Decimal;
    },
    previousStockPrice?: {
      date: Date;
      close: Prisma.Decimal;
    },
  ) {
    if (!latestStockPrice || !previousStockPrice) {
      return null;
    }

    const latestClose = latestStockPrice.close;
    const previousClose = previousStockPrice.close;
    const change = latestClose.sub(previousClose);
    const changePct =
      previousClose.isZero()
        ? null
        : change.div(previousClose).mul(100);
    const direction =
      change.gt(0)
        ? 'UP'
        : change.lt(0)
          ? 'DOWN'
          : 'FLAT';

    return {
      latestDate: latestStockPrice.date,
      latestClose: latestClose.toString(),
      previousDate: previousStockPrice.date,
      previousClose: previousClose.toString(),
      change: change.toString(),
      changePct: changePct?.toString() ?? null,
      direction,
    };
  }

  private formatPeriodLabel(
    period: PeriodType,
    fiscalYear: number,
    fiscalQuarter: number | null,
  ): string {
    if (
      period === PeriodType.Q1 ||
      period === PeriodType.Q2 ||
      period === PeriodType.Q3 ||
      period === PeriodType.Q4
    ) {
      return `Q${fiscalQuarter} ${fiscalYear}`;
    }

    return `FY ${fiscalYear}`;
  }

  private toBillionString(value: Prisma.Decimal | null): string | null {
    if (!value) {
      return null;
    }

    return value.div(1000000000).toDecimalPlaces(3).toString();
  }
}
