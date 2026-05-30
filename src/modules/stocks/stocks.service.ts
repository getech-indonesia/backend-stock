import { Injectable } from '@nestjs/common';
import { PeriodType, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { FindStocksQueryDto } from './dto/find-stocks-query.dto';
import { KeyStatisticsQueryDto } from './dto/key-statistics-query.dto';
import { TechnicalSeriesQueryDto } from './dto/technical-series-query.dto';

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
  eps: Prisma.Decimal | null;
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
  eps: Prisma.Decimal | null;
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

  async findOverviewBySymbol(
    symbol: string,
    query: TechnicalSeriesQueryDto,
  ) {
    const range = query.range ?? '1y';
    const interval = query.interval ?? '1mo';
    const fromDate = this.resolveFromDate(range);

    const listing = await this.prisma.listing.findFirst({
      where: {
        symbol: {
          equals: symbol,
          mode: 'insensitive',
        },
      },
      include: {
        company: {
          select: {
            id: true,
            legalName: true,
            displayName: true,
          },
        },
        stockPrices: {
          where: {
            date: {
              gte: fromDate,
            },
          },
          orderBy: {
            date: 'asc',
          },
        },
      },
    });

    if (!listing) {
      return null;
    }

    const pricesAsc = listing.stockPrices;
    const latest = pricesAsc[pricesAsc.length - 1];
    const previous = pricesAsc[pricesAsc.length - 2];
    if (!latest) {
      return null;
    }

    const ma50 = this.calculateSma(pricesAsc, 50);
    const ma200 = this.calculateSma(pricesAsc, 200);
    const rsi14 = this.calculateRsi(pricesAsc, 14);
    const avgVolume30 = this.calculateAvgVolume(pricesAsc, 30);

    const change = previous ? latest.close.sub(previous.close) : null;
    const changePct =
      previous && !previous.close.isZero()
        ? latest.close.sub(previous.close).div(previous.close).mul(100)
        : null;

    const signal = this.buildSimpleSignal({
      latestClose: latest.close,
      ma50,
      ma200,
      rsi14,
    });

    return {
      listing: {
        id: listing.id,
        symbol: listing.symbol,
      },
      meta: {
        period: {
          range,
          interval,
          from: fromDate,
          to: latest.date,
          points: pricesAsc.length,
        },
      },
      company: listing.company,
      snapshot: {
        date: latest.date,
        close: latest.close.toString(),
        change: change?.toString() ?? null,
        changePct: changePct?.toString() ?? null,
        volume: latest.volume.toString(),
      },
      indicators: {
        ma50: ma50?.toString() ?? null,
        ma200: ma200?.toString() ?? null,
        rsi14: rsi14?.toString() ?? null,
        avgVolume30: avgVolume30?.toString() ?? null,
      },
      signal,
    };
  }

  async findTechnicalSeriesBySymbol(
    symbol: string,
    query: TechnicalSeriesQueryDto,
  ) {
    const listing = await this.prisma.listing.findFirst({
      where: {
        symbol: {
          equals: symbol,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        symbol: true,
      },
    });

    if (!listing) {
      return null;
    }

    const fromDate = this.resolveFromDate(query.range ?? '1y');
    const rawPrices = await this.prisma.stockPrice.findMany({
      where: {
        listingId: listing.id,
        date: {
          gte: fromDate,
        },
      },
      orderBy: {
        date: 'asc',
      },
      take: query.limit,
    });

    const sampledPrices = this.sampleByInterval(rawPrices, query.interval ?? '1mo');
    const series = sampledPrices.map((point, index) => {
      const slice = sampledPrices.slice(0, index + 1);
      return {
        date: point.date,
        close: point.close.toString(),
        volume: point.volume.toString(),
        ma50: this.calculateSma(slice, 50)?.toString() ?? null,
        ma200: this.calculateSma(slice, 200)?.toString() ?? null,
        rsi14: this.calculateRsi(slice, 14)?.toString() ?? null,
      };
    });

    return {
      listing,
      meta: {
        range: query.range ?? '1y',
        interval: query.interval ?? '1mo',
        points: series.length,
      },
      series,
    };
  }

  async findWyckoffBySymbol(
    symbol: string,
    query: TechnicalSeriesQueryDto,
  ) {
    const range = query.range ?? '1y';
    const interval = query.interval ?? '1mo';
    const fromDate = this.resolveFromDate(range);

    const listing = await this.prisma.listing.findFirst({
      where: {
        symbol: {
          equals: symbol,
          mode: 'insensitive',
        },
      },
      include: {
        stockPrices: {
          where: {
            date: {
              gte: fromDate,
            },
          },
          orderBy: {
            date: 'asc',
          },
        },
      },
    });

    if (!listing) {
      return null;
    }

    const pricesAsc = listing.stockPrices;
    if (pricesAsc.length < 30) {
      return {
        listing: {
          id: listing.id,
          symbol: listing.symbol,
        },
        meta: {
          period: {
            range,
            interval,
            from: fromDate,
            to: pricesAsc[pricesAsc.length - 1]?.date ?? null,
            points: pricesAsc.length,
          },
        },
        wyckoff: {
          phase: 'INSUFFICIENT_DATA',
          confidence: null,
          notes: ['Data historis belum cukup untuk fase Wyckoff.'],
        },
      };
    }

    const latest = pricesAsc[pricesAsc.length - 1];
    const ma50 = this.calculateSma(pricesAsc, 50);
    const ma200 = this.calculateSma(pricesAsc, 200);
    const rsi14 = this.calculateRsi(pricesAsc, 14);
    const avgVolume30 = this.calculateAvgVolume(pricesAsc, 30);

    const recent = pricesAsc.slice(-30);
    const firstRecent = recent[0];
    const recentReturnPct = latest.close.sub(firstRecent.close).div(firstRecent.close).mul(100);

    const phase = this.resolveWyckoffPhase({
      recentReturnPct,
      latestClose: latest.close,
      ma50,
      ma200,
      rsi14,
      latestVolume: latest.volume,
      avgVolume30,
    });

    return {
      listing: {
        id: listing.id,
        symbol: listing.symbol,
      },
      meta: {
        period: {
          range,
          interval,
          from: fromDate,
          to: latest.date,
          points: pricesAsc.length,
        },
      },
      wyckoff: phase,
      indicators: {
        asOf: latest.date,
        close: latest.close.toString(),
        ma50: ma50?.toString() ?? null,
        ma200: ma200?.toString() ?? null,
        rsi14: rsi14?.toString() ?? null,
        avgVolume30: avgVolume30?.toString() ?? null,
        latestVolume: latest.volume.toString(),
        return30dPct: recentReturnPct.toString(),
      },
    };
  }

  async findTechnicalSummaryBySymbol(
    symbol: string,
    query: TechnicalSeriesQueryDto,
  ) {
    const [overview, wyckoff] = await Promise.all([
      this.findOverviewBySymbol(symbol, query),
      this.findWyckoffBySymbol(symbol, query),
    ]);

    if (!overview || !wyckoff) {
      return null;
    }

    return {
      listing: overview.listing,
      company: overview.company,
      meta: overview.meta,
      overview: {
        snapshot: overview.snapshot,
        indicators: overview.indicators,
        signal: overview.signal,
      },
      wyckoff: wyckoff.wyckoff,
      wyckoffIndicators: wyckoff.indicators,
    };
  }

  async findKeyStatisticsBySymbol(
    symbol: string,
    query: KeyStatisticsQueryDto,
  ) {
    const metric = query.metric ?? 'netIncome';
    const listing = await this.prisma.listing.findFirst({
      where: {
        symbol: {
          equals: symbol,
          mode: 'insensitive',
        },
      },
      include: {
        company: {
          select: {
            id: true,
            legalName: true,
            displayName: true,
          },
        },
        ajaibStockMarket: {
          select: {
            marketCap: true,
          },
        },
        stockPrices: {
          take: 1,
          orderBy: {
            date: 'desc',
          },
        },
      },
    });

    if (!listing) {
      return null;
    }

    const companyId = listing.company.id;
    const [latestSharesData, quarterlyStatements, annualStatements] = await Promise.all([
      this.prisma.sharesData.findFirst({
        where: { companyId },
        orderBy: { date: 'desc' },
      }),
      this.prisma.incomeStatement.findMany({
        where: {
          companyId,
          period: {
            in: [PeriodType.Q1, PeriodType.Q2, PeriodType.Q3, PeriodType.Q4],
          },
        },
        orderBy: [
          { fiscalYear: 'desc' },
          { fiscalQuarter: 'desc' },
        ],
        take: 12,
      }),
      this.prisma.incomeStatement.findMany({
        where: {
          companyId,
          period: PeriodType.ANNUAL,
        },
        orderBy: [{ fiscalYear: 'desc' }],
        take: 6,
      }),
    ]);

    const normalizedQuarterly = this.buildQuarterlyStatementsWithDerivedQ4(
      quarterlyStatements,
      annualStatements,
    );
    const selectedMetric = this.buildQuarterMetricSeries(
      normalizedQuarterly,
      metric,
      latestSharesData?.sharesOutstanding ?? null,
    );

    return {
      listing: {
        id: listing.id,
        symbol: listing.symbol,
      },
      company: listing.company,
      metric,
      quarterlyAndProjection: selectedMetric,
    };
  }

  async findKeyStatisticsSummaryBySymbol(symbol: string) {
    const listing = await this.prisma.listing.findFirst({
      where: {
        symbol: {
          equals: symbol,
          mode: 'insensitive',
        },
      },
      include: {
        company: {
          select: {
            id: true,
            legalName: true,
            displayName: true,
          },
        },
        ajaibStockMarket: {
          select: {
            marketCap: true,
          },
        },
        stockPrices: {
          take: 1,
          orderBy: {
            date: 'desc',
          },
        },
      },
    });

    if (!listing) {
      return null;
    }

    const companyId = listing.company.id;
    const [latestValuation, latestSharesData, quarterlyStatements, annualStatements] = await Promise.all([
      this.prisma.valuationRatio.findFirst({
        where: { companyId },
        orderBy: { date: 'desc' },
      }),
      this.prisma.sharesData.findFirst({
        where: { companyId },
        orderBy: { date: 'desc' },
      }),
      this.prisma.incomeStatement.findMany({
        where: {
          companyId,
          period: {
            in: [PeriodType.Q1, PeriodType.Q2, PeriodType.Q3, PeriodType.Q4],
          },
        },
        orderBy: [
          { fiscalYear: 'desc' },
          { fiscalQuarter: 'desc' },
        ],
        take: 12,
      }),
      this.prisma.incomeStatement.findMany({
        where: {
          companyId,
          period: PeriodType.ANNUAL,
        },
        orderBy: [{ fiscalYear: 'desc' }],
        take: 6,
      }),
    ]);
    const normalizedQuarterly = this.buildQuarterlyStatementsWithDerivedQ4(
      quarterlyStatements,
      annualStatements,
    );
    const latestPrice = listing.stockPrices[0]?.close ?? null;
    const peTtm = this.calculatePeTtm(
      latestPrice,
      normalizedQuarterly,
      latestSharesData?.sharesOutstanding ?? null,
    );

    return {
      listing: {
        id: listing.id,
        symbol: listing.symbol,
      },
      company: listing.company,
      valuationSummary: {
        marketCap:
          this.resolveMarketCap(
            latestSharesData?.marketCap ?? null,
            latestValuation?.marketCap ?? null,
            listing.ajaibStockMarket?.marketCap ?? null,
          )?.toString() ?? null,
        enterpriseValue: latestValuation?.enterpriseValue?.toString() ?? null,
        sharesOutstanding: latestSharesData?.sharesOutstanding?.toString() ?? null,
        freeFloatPct:
          latestSharesData &&
            latestSharesData.sharesFloat &&
            latestSharesData.sharesOutstanding > 0n
            ? new Prisma.Decimal(latestSharesData.sharesFloat.toString())
              .div(new Prisma.Decimal(latestSharesData.sharesOutstanding.toString()))
              .mul(100)
              .toDecimalPlaces(2)
              .toString()
            : null,
        peTtm: peTtm ?? latestValuation?.peRatio?.toString() ?? null,
      },
      dividendAndYield: {
        divTtm: null,
        payoutRatio: latestValuation?.dividendYield?.toString() ?? null,
        divYield: latestValuation?.dividendYield?.toString() ?? null,
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
        eps: this.subtractDecimal(annual.eps, q3.eps),
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

  private resolveFromDate(range: '6m' | '1y' | '2y' | '5y') {
    const today = new Date();
    const from = new Date(today);
    const rangeToMonths: Record<typeof range, number> = {
      '6m': 6,
      '1y': 12,
      '2y': 24,
      '5y': 60,
    };

    from.setUTCMonth(from.getUTCMonth() - rangeToMonths[range]);
    return from;
  }

  private sampleByInterval<T extends { date: Date }>(
    pricesAsc: T[],
    interval: '1d' | '1w' | '1mo',
  ): T[] {
    if (interval === '1d') {
      return pricesAsc;
    }

    const buckets = new Map<string, T>();
    for (const point of pricesAsc) {
      const date = point.date;
      const key =
        interval === '1w'
          ? `${date.getUTCFullYear()}-W${this.getWeekOfYear(date)}`
          : `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`;
      buckets.set(key, point);
    }

    return Array.from(buckets.values()).sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
  }

  private getWeekOfYear(date: Date): number {
    const temp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = temp.getUTCDay() || 7;
    temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
    return Math.ceil((((temp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  private calculateSma(
    pricesAsc: Array<{ close: Prisma.Decimal }>,
    period: number,
  ): Prisma.Decimal | null {
    if (pricesAsc.length < period) {
      return null;
    }

    const slice = pricesAsc.slice(-period);
    const sum = slice.reduce(
      (acc, item) => acc.add(item.close),
      new Prisma.Decimal(0),
    );

    return sum.div(period);
  }

  private calculateAvgVolume(
    pricesAsc: Array<{ volume: bigint }>,
    period: number,
  ): Prisma.Decimal | null {
    if (pricesAsc.length < period) {
      return null;
    }

    const slice = pricesAsc.slice(-period);
    const sum = slice.reduce(
      (acc, item) => acc.add(new Prisma.Decimal(item.volume.toString())),
      new Prisma.Decimal(0),
    );

    return sum.div(period);
  }

  private calculateRsi(
    pricesAsc: Array<{ close: Prisma.Decimal }>,
    period: number,
  ): Prisma.Decimal | null {
    if (pricesAsc.length < period + 1) {
      return null;
    }

    const recent = pricesAsc.slice(-(period + 1));
    let gain = new Prisma.Decimal(0);
    let loss = new Prisma.Decimal(0);

    for (let i = 1; i < recent.length; i += 1) {
      const delta = recent[i].close.sub(recent[i - 1].close);
      if (delta.gt(0)) {
        gain = gain.add(delta);
      } else if (delta.lt(0)) {
        loss = loss.add(delta.abs());
      }
    }

    const avgGain = gain.div(period);
    const avgLoss = loss.div(period);

    if (avgLoss.isZero()) {
      return new Prisma.Decimal(100);
    }

    const rs = avgGain.div(avgLoss);
    return new Prisma.Decimal(100).sub(new Prisma.Decimal(100).div(rs.add(1)));
  }

  private buildSimpleSignal(input: {
    latestClose: Prisma.Decimal;
    ma50: Prisma.Decimal | null;
    ma200: Prisma.Decimal | null;
    rsi14: Prisma.Decimal | null;
  }) {
    let score = 0;

    if (input.ma50 && input.latestClose.gt(input.ma50)) {
      score += 1;
    }

    if (input.ma200 && input.latestClose.gt(input.ma200)) {
      score += 1;
    }

    if (input.rsi14 && input.rsi14.gt(45) && input.rsi14.lt(70)) {
      score += 1;
    }

    if (score >= 3) {
      return 'OVERWEIGHT';
    }

    if (score === 2) {
      return 'NEUTRAL';
    }

    return 'UNDERWEIGHT';
  }

  private resolveWyckoffPhase(input: {
    recentReturnPct: Prisma.Decimal;
    latestClose: Prisma.Decimal;
    ma50: Prisma.Decimal | null;
    ma200: Prisma.Decimal | null;
    rsi14: Prisma.Decimal | null;
    latestVolume: bigint;
    avgVolume30: Prisma.Decimal | null;
  }) {
    const notes: string[] = [];
    const volumeRatio =
      input.avgVolume30 && !input.avgVolume30.isZero()
        ? new Prisma.Decimal(input.latestVolume.toString()).div(input.avgVolume30)
        : null;

    if (input.ma50 && input.latestClose.gt(input.ma50)) {
      notes.push('Harga berada di atas MA50 (momentum menengah positif).');
    } else {
      notes.push('Harga masih di bawah MA50 (momentum menengah lemah).');
    }

    if (input.ma200 && input.latestClose.gt(input.ma200)) {
      notes.push('Harga berada di atas MA200 (struktur jangka panjang cenderung bullish).');
    } else {
      notes.push('Harga masih di bawah MA200 (struktur jangka panjang belum pulih).');
    }

    if (volumeRatio) {
      notes.push(`Rasio volume terhadap rata-rata 30 hari: ${volumeRatio.toDecimalPlaces(2).toString()}x.`);
    }

    let phase = 'REACCUMULATION';
    let confidence = 0.55;

    if (input.recentReturnPct.gte(8)) {
      phase = 'MARKUP';
      confidence = 0.7;
    } else if (input.recentReturnPct.lte(-8)) {
      phase = 'MARKDOWN';
      confidence = 0.7;
    } else if (
      input.rsi14 &&
      input.rsi14.gte(60) &&
      volumeRatio &&
      volumeRatio.gte(1.1)
    ) {
      phase = 'MARKUP_II';
      confidence = 0.65;
    }

    return {
      phase,
      confidence,
      notes,
    };
  }

  private resolveMarketCap(
    sharesDataMarketCap: Prisma.Decimal | null,
    valuationMarketCap: Prisma.Decimal | null,
    ajaibMarketCap: Prisma.Decimal | null,
  ): Prisma.Decimal | null {
    const isPositive = (value: Prisma.Decimal | null) =>
      value !== null && value.gt(0);

    if (isPositive(sharesDataMarketCap)) {
      return sharesDataMarketCap;
    }

    if (isPositive(valuationMarketCap)) {
      return valuationMarketCap;
    }

    if (isPositive(ajaibMarketCap)) {
      return ajaibMarketCap;
    }

    return sharesDataMarketCap ?? valuationMarketCap ?? ajaibMarketCap;
  }

  private calculatePeTtm(
    latestPrice: Prisma.Decimal | null,
    quarterlyStatements: QuarterlyIncomeStatementLike[],
    sharesOutstanding: bigint | null,
  ): string | null {
    if (!latestPrice) {
      return null;
    }

    const sortedAsc = quarterlyStatements
      .slice()
      .sort((a, b) => {
        if (a.fiscalYear !== b.fiscalYear) {
          return a.fiscalYear - b.fiscalYear;
        }
        return (a.fiscalQuarter ?? 0) - (b.fiscalQuarter ?? 0);
      });
    const latest4 = sortedAsc.slice(-4);

    const epsTtmFromEps = latest4.reduce<Prisma.Decimal | null>((acc, row) => {
      if (!row.eps) {
        return acc;
      }
      if (!acc) {
        return row.eps;
      }
      return acc.add(row.eps);
    }, null);

    let epsTtm = epsTtmFromEps;
    if (!epsTtm && sharesOutstanding && sharesOutstanding > 0n) {
      const netIncomeTtm = latest4.reduce<Prisma.Decimal | null>((acc, row) => {
        if (!row.netIncome) {
          return acc;
        }
        if (!acc) {
          return row.netIncome;
        }
        return acc.add(row.netIncome);
      }, null);

      if (netIncomeTtm) {
        epsTtm = netIncomeTtm.div(new Prisma.Decimal(sharesOutstanding.toString()));
      }
    }

    if (!epsTtm || epsTtm.isZero()) {
      return null;
    }

    return latestPrice.div(epsTtm).toDecimalPlaces(2).toString();
  }

  private buildQuarterMetricSeries(
    quarterlyStatements: QuarterlyIncomeStatementLike[],
    metric: 'netIncome' | 'eps' | 'revenue',
    sharesOutstanding: bigint | null,
  ) {
    const sortedAsc = quarterlyStatements
      .slice()
      .sort((a, b) => {
        if (a.fiscalYear !== b.fiscalYear) {
          return a.fiscalYear - b.fiscalYear;
        }
        return (a.fiscalQuarter ?? 0) - (b.fiscalQuarter ?? 0);
      });

    const latest4 = sortedAsc.slice(-4);
    const quarterMap = new Map(
      sortedAsc.map((s) => [`${s.fiscalYear}-Q${s.fiscalQuarter}`, s]),
    );

    const valueOf = (s: QuarterlyIncomeStatementLike): Prisma.Decimal | null => {
      if (metric === 'netIncome') {
        return s.netIncome;
      }
      if (metric === 'revenue') {
        return s.revenue;
      }
      if (s.eps) {
        return s.eps;
      }
      if (s.netIncome && sharesOutstanding && sharesOutstanding > 0n) {
        return s.netIncome.div(new Prisma.Decimal(sharesOutstanding.toString()));
      }
      return null;
    };

    const latest4Rows = latest4.map((statement) => {
      const current = valueOf(statement);
      const prevYear = quarterMap.get(
        `${statement.fiscalYear - 1}-Q${statement.fiscalQuarter}`,
      );
      const prevValue = prevYear ? valueOf(prevYear) : null;
      const yoy =
        current && prevValue && !prevValue.isZero()
          ? current.sub(prevValue).div(prevValue).mul(100)
          : null;

      return {
        period: `Q${statement.fiscalQuarter} ${statement.fiscalYear}`,
        value: current?.toString() ?? null,
        growthYoY: yoy?.toDecimalPlaces(2).toString() ?? null,
      };
    });

    const ttm = latest4
      .map((s) => valueOf(s))
      .reduce<Prisma.Decimal | null>((acc, v) => {
        if (!v) {
          return acc;
        }
        if (!acc) {
          return v;
        }
        return acc.add(v);
      }, null);

    const prev4 = sortedAsc.slice(-8, -4);
    const prevTtm = prev4
      .map((s) => valueOf(s))
      .reduce<Prisma.Decimal | null>((acc, v) => {
        if (!v) {
          return acc;
        }
        if (!acc) {
          return v;
        }
        return acc.add(v);
      }, null);
    const ttmYoY =
      ttm && prevTtm && !prevTtm.isZero()
        ? ttm.sub(prevTtm).div(prevTtm).mul(100)
        : null;

    const growthValues = latest4Rows
      .map((row) => (row.growthYoY ? new Prisma.Decimal(row.growthYoY) : null))
      .filter((v): v is Prisma.Decimal => v !== null);
    const avgGrowth =
      growthValues.length > 0
        ? growthValues.reduce((a, b) => a.add(b), new Prisma.Decimal(0)).div(growthValues.length)
        : new Prisma.Decimal(0);

    const chartBars = latest4Rows.map((row) => ({
      label: row.period,
      value: row.value,
      type: 'actual' as const,
    }));

    const tableRows = [
      ...latest4Rows,
      {
        period: 'TTM',
        value: ttm?.toString() ?? null,
        growthYoY: ttmYoY?.toDecimalPlaces(2).toString() ?? null,
      },
    ];

    return {
      chart: chartBars,
      table: tableRows,
      ttm: {
        value: ttm?.toString() ?? null,
        avgGrowthYoY: avgGrowth.toDecimalPlaces(2).toString(),
        ttmGrowthYoY: ttmYoY?.toDecimalPlaces(2).toString() ?? null,
      },
    };
  }
}
