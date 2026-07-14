import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export interface G1BreakdownItem {
  currentYear: number;
  totalEPS: string | null;
  previousYear: number;
  previousTotalEPS: string | null;
  growthPct: number | null;
  formula: string;
  sourcePeriods: string[];
}

export interface GForwardSourceItem {
  fiscalYear: number;
  fiscalQuarter: number;
  source: 'actual' | 'carry_forward';
  value: string | null;
}

export interface GForwardBreakdown {
  forecastYear: number | null;
  latestQuarter: number | null;
  currentTotal: string | null;
  previousYear: number | null;
  previousTotal: string | null;
  growthPct: number | null;
  formula: string;
  sourcePeriods: GForwardSourceItem[];
}

export interface GrowthScoreResult {
  pillar: 'G';
  score: number;
  maxScore: number;
  details: {
    g1: {
      name: string;
      score: number;
      maxScore: number;
      rule: string;
      items: G1BreakdownItem[];
    };
    g2: {
      name: string;
      score: number;
      maxScore: number;
      rule: string;
      latestYear: number | null;
      netIncome: string | null;
      totalEquity: string | null;
      roePct: number | null;
      formula: string;
    };
    g3: {
      name: string;
      score: number;
      maxScore: number;
      rule: string;
      forecastYear: number | null;
      latestQuarter: number | null;
      currentTotal: string | null;
      previousYear: number | null;
      previousTotal: string | null;
      growthPct: number | null;
      formula: string;
      sourcePeriods: GForwardSourceItem[];
    };
    g4: {
      name: string;
      score: number;
      maxScore: number;
      rule: string;
      forecastYear: number | null;
      latestQuarter: number | null;
      currentTotal: string | null;
      previousYear: number | null;
      previousTotal: string | null;
      growthPct: number | null;
      formula: string;
      sourcePeriods: GForwardSourceItem[];
    };
  };
}

export interface RelativeStrengthScoreResult {
  pillar: 'R';
  score: number;
  maxScore: number;
  details: {
    r1: {
      name: string;
      score: number;
      maxScore: number;
      rule: string;
      currentRank: number | null;
      totalRanked: number;
      rsRating: number | null;
      rawPerformance: number | null;
      roc63: number | null;
      roc126: number | null;
      roc189: number | null;
      roc252: number | null;
      formula: string;
      sourcePeriods: string[];
    };
    r2: {
      name: string;
      score: number;
      maxScore: number;
      rule: string;
      close: number | null;
      high52: number | null;
      distanceHighPct: number | null;
      formula: string;
      sourcePeriods: string[];
    };
    r3: {
      name: string;
      score: number;
      maxScore: number;
      rule: string;
      close: number | null;
      low52: number | null;
      distanceLowPct: number | null;
      formula: string;
      sourcePeriods: string[];
    };
    r4: {
      name: string;
      score: number;
      maxScore: number;
      rule: string;
      currentRank: number | null;
      rank65TradingDaysAgo: number | null;
      deltaRS: number | null;
      currentRSRating: number | null;
      rs65TradingDaysAgo: number | null;
      formula: string;
      sourcePeriods: string[];
    };
  };
}

type AnnualMetricSeries = {
  fiscalYear: number;
  totalValue: number | null;
  sourcePeriods: string[];
};

type QuarterlyMetricRow = {
  fiscalYear: number;
  fiscalQuarter: number | null;
  eps: any;
  revenue: any;
  netIncome?: any;
  netIncomeAttributable?: any;
  currency?: string;
  periodEndDate?: Date | null;
};

type AnnualMetricRow = {
  fiscalYear: number;
  eps: any;
  revenue: any;
  netIncome?: any;
  netIncomeAttributable?: any;
  currency?: string;
  periodEndDate?: Date | null;
};

type PriceHistoryRow = {
  date: Date;
  high: any;
  low: any;
  close: any;
};

type StrengthSnapshot = {
  listingId: string;
  symbol: string;
  companyId: string;
  offsetTradingDays: number;
  close: number | null;
  high52: number | null;
  low52: number | null;
  distanceHighPct: number | null;
  distanceLowPct: number | null;
  roc63: number | null;
  roc126: number | null;
  roc189: number | null;
  roc252: number | null;
  rawPerformance: number | null;
  rsRating: number | null;
  rank: number | null;
  totalRanked: number;
  sourcePeriods: string[];
  availableTradingDays: number;
};

type GroveRuleRow = {
  score: any;
  description: string | null;
};

type GroveHorizonRow = {
  horizon: 'LONG' | 'MEDIUM' | 'SHORT';
  weightG: any;
  weightR: any;
  weightO: any;
  weightV: any;
  weightE: any;
};

type GroveWeightedTotalInput = {
  gScore: number | null;
  rScore: number | null;
  oScore: number | null;
  vScore: number | null;
  eScore: number | null;
};

@Injectable()
export class ListingScoreCalculator {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate G (Growth) Score for a listing.
   * G = G1 (EPS YoY consistency) + G2 (ROE) + G3 (EPS Growth Expected) + G4 (Revenue Growth Expected)
   * Max: 100 points (16 + 14 + 40 + 30)
   */
  async calculateGScore(companyId: string): Promise<GrowthScoreResult> {
    const quarterlyIncomeStatements =
      await this.prisma.incomeStatement.findMany({
        where: {
          companyId,
          period: {
            in: ['Q1', 'Q2', 'Q3', 'Q4'],
          },
        },
        orderBy: [{ fiscalYear: 'asc' }, { fiscalQuarter: 'asc' }],
      });

    const annualIncomeStatements = await this.prisma.incomeStatement.findMany({
      where: {
        companyId,
        period: 'ANNUAL',
      },
      orderBy: { fiscalYear: 'desc' },
      take: 5,
    });

    const annualBalanceSheets = await this.prisma.balanceSheet.findMany({
      where: {
        companyId,
        period: 'ANNUAL',
      },
      orderBy: { fiscalYear: 'desc' },
    });

    const quarterlyBalanceSheets = await this.prisma.balanceSheet.findMany({
      where: {
        companyId,
        period: {
          in: ['Q1', 'Q2', 'Q3', 'Q4'],
        },
      },
      orderBy: [{ fiscalYear: 'asc' }, { fiscalQuarter: 'asc' }],
    });

    const g1 = await this.calculateG1(
      companyId,
      quarterlyIncomeStatements,
      annualIncomeStatements,
    );
    const g2 = await this.calculateG2(
      companyId,
      quarterlyIncomeStatements,
      annualIncomeStatements,
      quarterlyBalanceSheets,
      annualBalanceSheets,
    );
    const g3 = await this.calculateForwardGrowth(
      companyId,
      quarterlyIncomeStatements,
      annualIncomeStatements,
      'eps',
      'Proyeksi Pertumbuhan EPS',
      40,
      'EPS TTM = kuartal aktual tahun berjalan + kuartal yang sama pada tahun sebelumnya untuk kuartal yang belum dilaporkan. Nilai: >25% = 40, >15% = 30, >5% = 20, >0% = 9, <=0% = 0.',
    );
    const g4 = await this.calculateForwardGrowth(
      companyId,
      quarterlyIncomeStatements,
      annualIncomeStatements,
      'revenue',
      'Proyeksi Pertumbuhan Pendapatan',
      30,
      'Pendapatan TTM = kuartal aktual tahun berjalan + kuartal yang sama pada tahun sebelumnya untuk kuartal yang belum dilaporkan. Nilai: >20% = 30, >10% = 23, >3% = 13, >0% = 7, <=0% = 0.',
    );

    return {
      pillar: 'G',
      score: g1.score + g2.score + g3.score + g4.score,
      maxScore: 100,
      details: {
        g1,
        g2,
        g3,
        g4,
      },
    };
  }

  /**
   * Calculate R (Relative Strength) Score for a listing.
   * R = R1 (Relative Strength Rating) + R2 (Near 52W High) + R3 (52W Low Rebound) + R4 (RS Rating Delta 13 Weeks)
   */
  async calculateRScore(
    companyId: string,
    listingId?: string,
  ): Promise<RelativeStrengthScoreResult> {
    const targetListing = await this.resolveTargetListing(companyId, listingId);
    const universe = await this.calculateRScoreUniverse();
    const result = universe[targetListing.id];

    if (!result) {
      throw new NotFoundException(
        `Relative strength result for listing ${targetListing.id} not found`,
      );
    }

    return result;
  }

  async calculateRScoreUniverse(): Promise<
    Record<string, RelativeStrengthScoreResult>
  > {
    await this.ensureRelativeStrengthRuleSet();

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
        stockPrices: {
          orderBy: {
            date: 'desc',
          },
          take: 318,
          select: {
            date: true,
            high: true,
            low: true,
            close: true,
          },
        },
      },
    });

    const snapshots = activeListings.map((listing) => {
      const series = listing.stockPrices
        .slice()
        .sort((a, b) => a.date.getTime() - b.date.getTime());

      return {
        listingId: listing.id,
        symbol: listing.symbol,
        companyId: listing.companyId,
        current: this.buildStrengthSnapshot({
          listingId: listing.id,
          symbol: listing.symbol,
          companyId: listing.companyId,
          series,
          offsetTradingDays: 0,
        }),
        historical: this.buildStrengthSnapshot({
          listingId: listing.id,
          symbol: listing.symbol,
          companyId: listing.companyId,
          series,
          offsetTradingDays: 65,
        }),
      };
    });

    const currentRanked = this.rankRelativeStrengthSnapshots(
      snapshots
        .map((item) => item.current)
        .filter((item): item is StrengthSnapshot => item !== null),
    );
    const historicalRanked = this.rankRelativeStrengthSnapshots(
      snapshots
        .map((item) => item.historical)
        .filter((item): item is StrengthSnapshot => item !== null),
    );

    const [r1Rules, r2Rules, r3Rules, r4Rules] = await Promise.all([
      this.getGroveRules('R', 'R1'),
      this.getGroveRules('R', 'R2'),
      this.getGroveRules('R', 'R3'),
      this.getGroveRules('R', 'R4'),
    ]);

    const resultByListingId: Record<string, RelativeStrengthScoreResult> = {};

    for (const snapshot of snapshots) {
      resultByListingId[snapshot.listingId] = this.buildRelativeStrengthResult({
        snapshot,
        currentRanked,
        historicalRanked,
        r1Rules,
        r2Rules,
        r3Rules,
        r4Rules,
      });
    }

    return resultByListingId;
  }

  async calculateGroveWeightedTotal(
    input: GroveWeightedTotalInput,
    weights?: {
      weightG: number;
      weightR: number;
      weightO: number;
      weightV: number;
      weightE: number;
    },
  ): Promise<number> {
    const resolvedWeights = weights ?? (await this.getGroveWeights());

    const weightedTotal =
      this.normalizeScore(input.gScore) * resolvedWeights.weightG +
      this.normalizeScore(input.rScore) * resolvedWeights.weightR +
      this.normalizeScore(input.oScore) * resolvedWeights.weightO +
      this.normalizeScore(input.vScore) * resolvedWeights.weightV +
      this.normalizeScore(input.eScore) * resolvedWeights.weightE;

    return this.round2(this.clampTotalScore(weightedTotal));
  }

  private buildRelativeStrengthResult(input: {
    snapshot: {
      listingId: string;
      symbol: string;
      companyId: string;
      current: StrengthSnapshot | null;
      historical: StrengthSnapshot | null;
    };
    currentRanked: StrengthSnapshot[];
    historicalRanked: StrengthSnapshot[];
    r1Rules: GroveRuleRow[];
    r2Rules: GroveRuleRow[];
    r3Rules: GroveRuleRow[];
    r4Rules: GroveRuleRow[];
  }): RelativeStrengthScoreResult {
    const targetCurrent =
      input.currentRanked.find(
        (item) => item.listingId === input.snapshot.listingId,
      ) ?? null;
    const targetHistorical =
      input.historicalRanked.find(
        (item) => item.listingId === input.snapshot.listingId,
      ) ?? null;

    const r1Score = this.resolveRuleScore(
      input.r1Rules,
      targetCurrent?.rsRating ?? null,
      true,
    );
    const r2Score = this.resolveRuleScore(
      input.r2Rules,
      targetCurrent?.distanceHighPct ?? null,
      false,
    );
    const r3Score = this.resolveRuleScore(
      input.r3Rules,
      targetCurrent?.distanceLowPct ?? null,
      true,
    );
    const deltaRS =
      targetCurrent?.rsRating !== null &&
      targetCurrent?.rsRating !== undefined &&
      targetHistorical?.rsRating !== null &&
      targetHistorical?.rsRating !== undefined
        ? this.round2(targetCurrent.rsRating - targetHistorical.rsRating)
        : null;
    const r4Score = this.resolveRuleScore(input.r4Rules, deltaRS, true);

    return {
      pillar: 'R',
      score: r1Score + r2Score + r3Score + r4Score,
      maxScore:
        this.maxRuleScore(input.r1Rules) +
        this.maxRuleScore(input.r2Rules) +
        this.maxRuleScore(input.r3Rules) +
        this.maxRuleScore(input.r4Rules),
      details: {
        r1: {
          name: 'Relative Strength Rating',
          score: r1Score,
          maxScore: this.maxRuleScore(input.r1Rules),
          rule: this.describeRuleSet(input.r1Rules, 'RS Rating percentile'),
          currentRank: targetCurrent?.rank ?? null,
          totalRanked: targetCurrent?.totalRanked ?? input.currentRanked.length,
          rsRating: targetCurrent?.rsRating ?? null,
          rawPerformance: targetCurrent?.rawPerformance ?? null,
          roc63: targetCurrent?.roc63 ?? null,
          roc126: targetCurrent?.roc126 ?? null,
          roc189: targetCurrent?.roc189 ?? null,
          roc252: targetCurrent?.roc252 ?? null,
          formula:
            'RP = 0.40 x ROC63 + 0.20 x ROC126 + 0.20 x ROC189 + 0.20 x ROC252; RS Rating = ((totalRanked - rank) / totalRanked) x 100',
          sourcePeriods: targetCurrent?.sourcePeriods ?? [],
        },
        r2: {
          name: '52 Week High Distance',
          score: r2Score,
          maxScore: this.maxRuleScore(input.r2Rules),
          rule: this.describeRuleSet(input.r2Rules, 'distanceHighPct'),
          close: targetCurrent?.close ?? null,
          high52: targetCurrent?.high52 ?? null,
          distanceHighPct: targetCurrent?.distanceHighPct ?? null,
          formula: 'distanceHigh = (high52 - close) / high52 x 100',
          sourcePeriods: targetCurrent?.sourcePeriods ?? [],
        },
        r3: {
          name: '52 Week Low Rebound',
          score: r3Score,
          maxScore: this.maxRuleScore(input.r3Rules),
          rule: this.describeRuleSet(input.r3Rules, 'distanceLowPct'),
          close: targetCurrent?.close ?? null,
          low52: targetCurrent?.low52 ?? null,
          distanceLowPct: targetCurrent?.distanceLowPct ?? null,
          formula: 'distanceLow = (close - low52) / low52 x 100',
          sourcePeriods: targetCurrent?.sourcePeriods ?? [],
        },
        r4: {
          name: 'RS Rating Delta 13 Weeks',
          score: r4Score,
          maxScore: this.maxRuleScore(input.r4Rules),
          rule: this.describeRuleSet(input.r4Rules, 'deltaRS'),
          currentRank: targetCurrent?.rank ?? null,
          rank65TradingDaysAgo: targetHistorical?.rank ?? null,
          deltaRS,
          currentRSRating: targetCurrent?.rsRating ?? null,
          rs65TradingDaysAgo: targetHistorical?.rsRating ?? null,
          formula: 'deltaRS = RS sekarang - RS 65 trading days lalu',
          sourcePeriods: targetCurrent?.sourcePeriods ?? [],
        },
      },
    };
  }

  private async resolveTargetListing(companyId: string, listingId?: string) {
    if (listingId) {
      const listing = await this.prisma.listing.findUnique({
        where: { id: listingId },
        select: {
          id: true,
          companyId: true,
          symbol: true,
        },
      });

      if (!listing) {
        throw new NotFoundException(`Listing ${listingId} not found`);
      }

      return listing;
    }

    const listing = await this.prisma.listing.findFirst({
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
        symbol: true,
      },
    });

    if (!listing) {
      throw new NotFoundException(`Listing for company ${companyId} not found`);
    }

    return listing;
  }

  private buildStrengthSnapshot(input: {
    listingId: string;
    symbol: string;
    companyId: string;
    series: PriceHistoryRow[];
    offsetTradingDays: number;
  }): StrengthSnapshot | null {
    const currentIndex = input.series.length - 1 - input.offsetTradingDays;
    if (currentIndex < 0) {
      return null;
    }

    const activeSeries = input.series.slice(0, currentIndex + 1);
    const currentRow = activeSeries[activeSeries.length - 1];
    if (!currentRow) {
      return null;
    }

    const close = this.toNullableNumber(currentRow.close);
    if (close === null) {
      return null;
    }

    const roc63 = this.computeRoc(activeSeries, 63);
    const roc126 = this.computeRoc(activeSeries, 126);
    const roc189 = this.computeRoc(activeSeries, 189);
    const roc252 = this.computeRoc(activeSeries, 252);

    const rawPerformance =
      roc63 !== null && roc126 !== null && roc189 !== null && roc252 !== null
        ? this.round2(0.4 * roc63 + 0.2 * roc126 + 0.2 * roc189 + 0.2 * roc252)
        : null;

    const window252 = activeSeries.slice(-252);
    const has52WeekWindow = window252.length === 252;

    const high52 = has52WeekWindow
      ? window252.reduce<number | null>((max, row) => {
          const value = this.toNullableNumber(row.high);
          if (value === null) {
            return max;
          }
          return max === null || value > max ? value : max;
        }, null)
      : null;

    const low52 = has52WeekWindow
      ? window252.reduce<number | null>((min, row) => {
          const value = this.toNullableNumber(row.low);
          if (value === null) {
            return min;
          }
          return min === null || value < min ? value : min;
        }, null)
      : null;

    const distanceHighPct =
      high52 !== null && high52 !== 0
        ? this.round2(((high52 - close) / high52) * 100)
        : null;
    const distanceLowPct =
      low52 !== null && low52 !== 0
        ? this.round2(((close - low52) / low52) * 100)
        : null;

    return {
      listingId: input.listingId,
      symbol: input.symbol,
      companyId: input.companyId,
      offsetTradingDays: input.offsetTradingDays,
      close,
      high52,
      low52,
      distanceHighPct,
      distanceLowPct,
      roc63,
      roc126,
      roc189,
      roc252,
      rawPerformance,
      rsRating: null,
      rank: null,
      totalRanked: 0,
      sourcePeriods: this.buildSourcePeriods(
        activeSeries,
        input.offsetTradingDays,
      ),
      availableTradingDays: activeSeries.length,
    };
  }

  private computeRoc(
    series: PriceHistoryRow[],
    offsetTradingDays: number,
  ): number | null {
    const currentIndex = series.length - 1;
    const previousIndex = currentIndex - offsetTradingDays;

    if (previousIndex < 0) {
      return null;
    }

    const currentClose = this.toNullableNumber(series[currentIndex]?.close);
    const previousClose = this.toNullableNumber(series[previousIndex]?.close);

    if (
      currentClose === null ||
      previousClose === null ||
      previousClose === 0
    ) {
      return null;
    }

    return this.round2(((currentClose - previousClose) / previousClose) * 100);
  }

  private buildSourcePeriods(
    series: PriceHistoryRow[],
    offsetTradingDays: number,
  ) {
    const current = series[series.length - 1];
    const currentLabel = current
      ? current.date.toISOString().slice(0, 10)
      : `T-${offsetTradingDays}`;

    return [
      `current:${currentLabel}`,
      'roc63',
      'roc126',
      'roc189',
      'roc252',
      'window252',
      `offset:${offsetTradingDays}`,
    ];
  }

  private rankRelativeStrengthSnapshots(snapshots: StrengthSnapshot[]) {
    const validSnapshots = snapshots
      .filter((snapshot) => snapshot.rawPerformance !== null)
      .slice()
      .sort((a, b) => {
        const left = a.rawPerformance ?? Number.NEGATIVE_INFINITY;
        const right = b.rawPerformance ?? Number.NEGATIVE_INFINITY;

        if (right !== left) {
          return right - left;
        }

        return a.symbol.localeCompare(b.symbol);
      });

    const totalRanked = validSnapshots.length;
    const rankedById = new Map<string, StrengthSnapshot>();

    validSnapshots.forEach((snapshot, index) => {
      const rank = index + 1;
      const rsRating =
        totalRanked > 0
          ? this.round2(((totalRanked - rank) / totalRanked) * 100)
          : null;
      rankedById.set(snapshot.listingId, {
        ...snapshot,
        rank,
        totalRanked,
        rsRating,
      });
    });

    return snapshots.map((snapshot) => {
      const ranked = rankedById.get(snapshot.listingId);
      if (ranked) {
        return ranked;
      }

      return {
        ...snapshot,
        rank: null,
        totalRanked,
        rsRating: null,
      };
    });
  }

  private async getGroveRules(
    pillar: string,
    metric: string,
  ): Promise<GroveRuleRow[]> {
    const formula = await this.prisma.groveFormula.findFirst({
      where: {
        isActive: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
      },
    });

    const baseWhere: Prisma.GroveRuleWhereInput = {
      pillar,
      metric,
    };

    const activeFormulaRules = formula
      ? await this.prisma.groveRule.findMany({
          where: {
            ...baseWhere,
            formulaId: formula.id,
          },
          orderBy: [
            {
              createdAt: 'asc',
            },
            {
              score: 'asc',
            },
          ],
          select: {
            score: true,
            description: true,
          },
        })
      : [];

    if (activeFormulaRules.length > 0) {
      return activeFormulaRules;
    }

    return this.prisma.groveRule.findMany({
      where: baseWhere,
      orderBy: [
        {
          createdAt: 'asc',
        },
        {
          score: 'asc',
        },
      ],
      select: {
        score: true,
        description: true,
      },
    });
  }

  private async ensureRelativeStrengthRuleSet() {
    const formula = await this.prisma.groveFormula.upsert({
      where: {
        code: 'GROVE_V2',
      },
      update: {
        isActive: true,
      },
      create: {
        code: 'GROVE_V2',
        description: 'GROVE v2 formula',
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    const rules = [
      { score: 28, description: '<5% => 28' },
      { score: 20, description: '5-15% => 20' },
      { score: 12, description: '15-25% => 12' },
      { score: 4, description: '25-40% => 4' },
      { score: 0, description: '>40% => 0' },
    ] as const;

    for (const rule of rules) {
      const existing = await this.prisma.groveRule.findFirst({
        where: {
          formulaId: formula.id,
          pillar: 'R',
          metric: 'R2',
          score: new Prisma.Decimal(rule.score),
        },
        select: {
          id: true,
        },
      });

      if (existing) {
        continue;
      }

      await this.prisma.groveRule.create({
        data: {
          formulaId: formula.id,
          pillar: 'R',
          metric: 'R2',
          score: new Prisma.Decimal(rule.score),
          description: rule.description,
        },
      });
    }
  }

  async getGroveWeights() {
    const horizon =
      (await this.resolveFormulaHorizonWeights('GROVE_V2')) ??
      (await this.resolveFormulaHorizonWeights('G'));
    if (!horizon) {
      throw new NotFoundException('No grove horizon weights found');
    }

    return {
      weightG: this.normalizeWeight(horizon.weightG),
      weightR: this.normalizeWeight(horizon.weightR),
      weightO: this.normalizeWeight(horizon.weightO),
      weightV: this.normalizeWeight(horizon.weightV),
      weightE: this.normalizeWeight(horizon.weightE),
    };
  }

  private async resolveFormulaHorizonWeights(formulaCode: string) {
    const formula = await this.prisma.groveFormula.findFirst({
      where: {
        code: formulaCode,
        isActive: true,
      },
      select: {
        horizons: {
          select: {
            horizon: true,
            weightG: true,
            weightR: true,
            weightO: true,
            weightV: true,
            weightE: true,
          },
        },
      },
    });

    return this.pickDefaultHorizon(formula?.horizons ?? []);
  }

  private pickDefaultHorizon(horizons: GroveHorizonRow[]) {
    return (
      horizons.find((item) => item.horizon === 'LONG') ?? horizons[0] ?? null
    );
  }

  private resolveRuleScore(
    rules: GroveRuleRow[],
    value: number | null,
    higherIsBetter: boolean,
  ): number {
    if (value === null) {
      return 0;
    }

    const parsedRules = rules
      .map((rule) => ({
        rule,
        condition: this.parseRuleCondition(rule.description),
      }))
      .filter((item) => item.condition !== null);

    for (const item of parsedRules) {
      if (this.matchesRuleCondition(value, item.condition!, higherIsBetter)) {
        return this.toNumber(item.rule.score) ?? 0;
      }
    }

    if (rules.length === 1) {
      return this.toNumber(rules[0].score) ?? 0;
    }

    return 0;
  }

  private parseRuleCondition(description: string | null): RuleCondition | null {
    if (!description) {
      return null;
    }

    const text = description.trim().toLowerCase();

    const betweenMatch =
      text.match(
        /between\s+(-?\d+(?:\.\d+)?)\s+(?:and|to|dan|-)\s+(-?\d+(?:\.\d+)?)/i,
      ) ?? text.match(/(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/i);
    if (betweenMatch) {
      const left = Number(betweenMatch[1]);
      const right = Number(betweenMatch[2]);
      if (Number.isFinite(left) && Number.isFinite(right)) {
        return {
          type: 'between',
          min: Math.min(left, right),
          max: Math.max(left, right),
        };
      }
    }

    const gteMatch = text.match(/(?:>=|=>)\s*(-?\d+(?:\.\d+)?)/i);
    if (gteMatch) {
      return {
        type: 'gte',
        value: Number(gteMatch[1]),
      };
    }

    const lteMatch = text.match(/(?:<=|=<)\s*(-?\d+(?:\.\d+)?)/i);
    if (lteMatch) {
      return {
        type: 'lte',
        value: Number(lteMatch[1]),
      };
    }

    const gtMatch = text.match(/(?:>|lebih besar dari)\s*(-?\d+(?:\.\d+)?)/i);
    if (gtMatch) {
      return {
        type: 'gt',
        value: Number(gtMatch[1]),
      };
    }

    const ltMatch = text.match(/(?:<|lebih kecil dari)\s*(-?\d+(?:\.\d+)?)/i);
    if (ltMatch) {
      return {
        type: 'lt',
        value: Number(ltMatch[1]),
      };
    }

    return null;
  }

  private matchesRuleCondition(
    value: number,
    condition: RuleCondition,
    higherIsBetter: boolean,
  ): boolean {
    void higherIsBetter;
    switch (condition.type) {
      case 'between':
        return value >= condition.min && value <= condition.max;
      case 'gte':
        return value >= condition.value;
      case 'lte':
        return value <= condition.value;
      case 'gt':
        return value > condition.value;
      case 'lt':
        return value < condition.value;
      default:
        return false;
    }
  }

  private describeRuleSet(rules: GroveRuleRow[], fallback: string) {
    if (rules.length === 0) {
      return `No grove rule found for ${fallback}`;
    }

    return rules
      .map((rule) => {
        const score = this.toNumber(rule.score);
        return `${score ?? 0}: ${rule.description ?? fallback}`;
      })
      .join(' | ');
  }

  private maxRuleScore(rules: GroveRuleRow[]) {
    if (rules.length === 0) {
      return 0;
    }

    return rules.reduce((max, rule) => {
      const score = this.toNumber(rule.score) ?? 0;
      return score > max ? score : max;
    }, 0);
  }

  private normalizeWeight(value: any) {
    const numeric = this.toNumber(value);
    return numeric === null ? 0 : numeric / 100;
  }

  private normalizeScore(value: number | null) {
    return value === null || value === undefined ? 0 : value;
  }

  private clampTotalScore(totalScore: number) {
    if (!Number.isFinite(totalScore)) {
      return 0;
    }

    return Math.min(100, Math.max(0, totalScore));
  }

  private async calculateG1(
    companyId: string,
    quarterlyStatements: QuarterlyMetricRow[],
    annualStatements: AnnualMetricRow[],
  ) {
    const annualSeries = (
      await this.buildAnnualSeries(
        companyId,
        quarterlyStatements,
        annualStatements,
        'eps',
      )
    ).slice(0, 4);
    const items: G1BreakdownItem[] = [];

    for (let i = 0; i < annualSeries.length - 1; i++) {
      const current = annualSeries[i];
      const previous = annualSeries[i + 1];

      let growthPct: number | null = null;
      if (
        current.totalValue !== null &&
        previous.totalValue !== null &&
        previous.totalValue !== 0
      ) {
        growthPct = this.round2(
          ((current.totalValue - previous.totalValue) / previous.totalValue) *
            100,
        );
      }

      items.push({
        currentYear: current.fiscalYear,
        totalEPS: this.toText(current.totalValue),
        previousYear: previous.fiscalYear,
        previousTotalEPS: this.toText(previous.totalValue),
        growthPct,
        formula: `(${this.toText(current.totalValue) ?? 'null'} - ${this.toText(previous.totalValue) ?? 'null'}) / ${this.toText(previous.totalValue) ?? 'null'} x 100`,
        sourcePeriods: current.sourcePeriods,
      });
    }

    const validGrowths = items.filter(
      (item) => item.growthPct !== null,
    ) as Array<G1BreakdownItem & { growthPct: number }>;

    const positiveCount = validGrowths.filter(
      (item) => item.growthPct > 0,
    ).length;
    const over15Count = validGrowths.filter(
      (item) => item.growthPct > 15,
    ).length;

    let score = 0;
    if (validGrowths.length >= 3) {
      if (over15Count === 3) {
        score = 16;
      } else if (positiveCount === 3 && over15Count >= 1) {
        score = 12;
      } else if (positiveCount === 3) {
        score = 8;
      } else if (positiveCount === 2) {
        score = 4;
      }
    } else if (validGrowths.length === 2) {
      if (over15Count === 2) {
        score = 12;
      } else if (positiveCount === 2 && over15Count >= 1) {
        score = 8;
      } else if (positiveCount === 2) {
        score = 4;
      }
    } else if (validGrowths.length === 1) {
      score = validGrowths[0].growthPct > 0 ? 4 : 0;
    }

    return {
      name: 'EPS YoY Konsistensi 3 Tahun',
      score,
      maxScore: 16,
      rule: 'Hitung 3 YoY EPS growth terakhir dari total EPS tahunan (Q1-Q4). 16 jika semua > 15%, 12 jika semua positif dan minimal 1 > 15%, 8 jika semua positif dan semuanya <= 15%, 4 jika hanya 2 dari 3 positif, 0 jika mayoritas negatif.',
      items,
    };
  }

  private async calculateG2(
    companyId: string,
    quarterlyIncomeStatements: QuarterlyMetricRow[],
    annualIncomeStatements: AnnualMetricRow[],
    quarterlyBalanceSheets: {
      fiscalYear: number;
      totalEquity: any;
      currency: string;
    }[],
    annualBalanceSheets: {
      fiscalYear: number;
      totalEquity: any;
      currency: string;
    }[],
  ) {
    const latestIncome = annualIncomeStatements[0] ?? null;
    const latestYear = latestIncome?.fiscalYear ?? null;

    let netIncome: number | null = null;
    let totalEquity: number | null = null;

    if (latestYear !== null) {
      // Sum net income from quarters if available
      const yearQuartersIS = quarterlyIncomeStatements.filter(
        (s) => s.fiscalYear === latestYear,
      );
      if (yearQuartersIS.length > 0) {
        netIncome = yearQuartersIS.reduce(
          (sum, s) =>
            sum + (this.toNumber(s.netIncomeAttributable ?? s.netIncome) ?? 0),
          0,
        );
      } else {
        const annualIncome = annualIncomeStatements.find(
          (s) => s.fiscalYear === latestYear,
        );
        netIncome = annualIncome
          ? this.toNumber(
              annualIncome.netIncomeAttributable ?? annualIncome.netIncome,
            )
          : null;
        if (netIncome !== null) {
          netIncome = await this.normalizeValue(
            netIncome,
            annualIncome?.currency || 'IDR',
            companyId,
          );
        }
      }

      // Sum total equity from quarters if available
      const yearQuartersBS = quarterlyBalanceSheets.filter(
        (s) => s.fiscalYear === latestYear,
      );
      if (yearQuartersBS.length > 0) {
        totalEquity = yearQuartersBS.reduce(
          (sum, s) => sum + (this.toNumber(s.totalEquity) ?? 0),
          0,
        );
      } else {
        const annualBalance =
          annualBalanceSheets.find((s) => s.fiscalYear === latestYear) ??
          annualBalanceSheets[0] ??
          null;
        totalEquity = annualBalance
          ? this.toNumber(annualBalance.totalEquity)
          : null;
        if (totalEquity !== null) {
          totalEquity = await this.normalizeValue(
            totalEquity,
            annualBalance?.currency || 'IDR',
            companyId,
          );
        }
      }
    }

    let roePct: number | null = null;
    let score = 0;

    if (netIncome !== null && totalEquity !== null && totalEquity > 0) {
      roePct = this.round2((netIncome / totalEquity) * 100);

      if (roePct > 20) {
        score = 14;
      } else if (roePct >= 15) {
        score = 10;
      } else if (roePct >= 10) {
        score = 6;
      } else if (roePct >= 5) {
        score = 2;
      }
    }

    return {
      name: 'ROE',
      score,
      maxScore: 14,
      rule: 'ROE = Laba Bersih / Ekuitas. 14 jika > 20%, 10 jika 15-20%, 6 jika 10-15%, 2 jika 5-10%, 0 jika < 5%.',
      latestYear,
      netIncome: this.toText(netIncome),
      totalEquity: this.toText(totalEquity),
      roePct,
      formula: `ROE = ${this.toText(netIncome) ?? 'null'} / ${this.toText(totalEquity) ?? 'null'} x 100`,
    };
  }

  private async calculateForwardGrowth(
    companyId: string,
    quarterlyStatements: QuarterlyMetricRow[],
    annualStatements: AnnualMetricRow[],
    metric: 'eps' | 'revenue',
    name: string,
    maxScore: number,
    rule: string,
  ): Promise<
    GForwardBreakdown & {
      name: string;
      score: number;
      maxScore: number;
      rule: string;
    }
  > {
    const series = await this.buildForwardTtmSeries(
      companyId,
      quarterlyStatements,
      annualStatements,
      metric,
    );

    if (!series) {
      return {
        name,
        score: 0,
        maxScore,
        rule,
        forecastYear: null,
        latestQuarter: null,
        currentTotal: null,
        previousYear: null,
        previousTotal: null,
        growthPct: null,
        formula: `(${name} TTM - previous year) / previous year x 100`,
        sourcePeriods: [],
      };
    }

    const {
      forecastYear,
      latestQuarter,
      currentTotal,
      previousYear,
      previousTotal,
      sourcePeriods,
    } = series;

    let growthPct: number | null = null;
    if (
      currentTotal !== null &&
      previousTotal !== null &&
      previousTotal !== 0
    ) {
      growthPct = this.round2(
        ((currentTotal - previousTotal) / previousTotal) * 100,
      );
    }

    const score = this.scoreForwardGrowth(metric, growthPct);

    return {
      name,
      score,
      maxScore,
      rule,
      forecastYear,
      latestQuarter,
      currentTotal: this.toText(currentTotal),
      previousYear,
      previousTotal: this.toText(previousTotal),
      growthPct,
      formula: `${metric.toUpperCase()} TTM ${forecastYear ?? 'null'} = (${this.toText(currentTotal) ?? 'null'} - ${this.toText(previousTotal) ?? 'null'}) / ${this.toText(previousTotal) ?? 'null'} x 100`,
      sourcePeriods,
    };
  }

  private scoreForwardGrowth(
    metric: 'eps' | 'revenue',
    growthPct: number | null,
  ): number {
    if (growthPct === null) {
      return 0;
    }

    if (metric === 'eps') {
      if (growthPct > 25) return 40;
      if (growthPct > 15) return 30;
      if (growthPct > 5) return 20;
      if (growthPct > 0) return 9;
      return 0;
    }

    if (growthPct > 20) return 30;
    if (growthPct > 10) return 23;
    if (growthPct > 3) return 13;
    if (growthPct > 0) return 7;
    return 0;
  }

  private async buildForwardTtmSeries(
    companyId: string,
    quarterlyStatements: QuarterlyMetricRow[],
    annualStatements: AnnualMetricRow[],
    metric: 'eps' | 'revenue',
  ) {
    const grouped = new Map<number, Map<number, QuarterlyMetricRow>>();

    for (const statement of quarterlyStatements) {
      if (!statement.fiscalQuarter) {
        continue;
      }

      const yearMap =
        grouped.get(statement.fiscalYear) ??
        new Map<number, QuarterlyMetricRow>();
      yearMap.set(statement.fiscalQuarter, statement);
      grouped.set(statement.fiscalYear, yearMap);
    }

    if (grouped.size === 0) {
      return null;
    }

    const latestYear = Math.max(...Array.from(grouped.keys()));
    const currentYearRows = grouped.get(latestYear);
    if (!currentYearRows || currentYearRows.size === 0) {
      return null;
    }

    const latestQuarter = Math.max(...Array.from(currentYearRows.keys()));
    const previousYear = latestYear - 1;
    const previousYearRows = grouped.get(previousYear);

    if (!previousYearRows || previousYearRows.size === 0) {
      return null;
    }

    const currentSources: GForwardSourceItem[] = [];
    let currentTotal = 0;

    for (let quarter = 1; quarter <= latestQuarter; quarter++) {
      const row = currentYearRows.get(quarter);
      const value = row
        ? (this.toNumber(metric === 'eps' ? row.eps : row.revenue) ?? 0)
        : 0;

      currentTotal += value;
      currentSources.push({
        fiscalYear: latestYear,
        fiscalQuarter: quarter,
        source: 'actual',
        value: this.toText(value),
      });
    }

    for (let quarter = latestQuarter + 1; quarter <= 4; quarter++) {
      const carryRow = previousYearRows.get(quarter);
      const carryValue = carryRow
        ? (this.toNumber(metric === 'eps' ? carryRow.eps : carryRow.revenue) ??
          0)
        : 0;

      currentTotal += carryValue;
      currentSources.push({
        fiscalYear: latestYear,
        fiscalQuarter: quarter,
        source: 'carry_forward',
        value: this.toText(carryValue),
      });
    }

    const previousTotal = await this.getAnnualMetricValue(
      previousYear,
      metric,
      quarterlyStatements,
      annualStatements,
      companyId,
    );
    if (previousTotal === null) {
      return null;
    }

    return {
      forecastYear: latestYear,
      latestQuarter,
      currentTotal,
      previousYear,
      previousTotal,
      sourcePeriods: currentSources,
    };
  }

  private async buildAnnualSeries(
    companyId: string,
    quarterlyStatements: QuarterlyMetricRow[],
    annualStatements: AnnualMetricRow[],
    metric: 'eps' | 'revenue',
  ): Promise<AnnualMetricSeries[]> {
    const yearlyMap = new Map<number, AnnualMetricSeries>();
    const grouped = new Map<
      number,
      { fiscalQuarter: number; value: number | null }[]
    >();

    for (const statement of quarterlyStatements) {
      if (!statement.fiscalQuarter) {
        continue;
      }

      const bucket = grouped.get(statement.fiscalYear) ?? [];
      bucket.push({
        fiscalQuarter: statement.fiscalQuarter,
        value: this.toNumber(
          metric === 'eps' ? statement.eps : statement.revenue,
        ),
      });
      grouped.set(statement.fiscalYear, bucket);
    }

    for (const [fiscalYear, rows] of grouped.entries()) {
      if (rows.length !== 4) {
        continue;
      }

      const sortedRows = rows
        .slice()
        .sort((a, b) => a.fiscalQuarter - b.fiscalQuarter);
      const values = sortedRows.map((row) => row.value);
      if (values.some((value) => value === null)) {
        continue;
      }

      yearlyMap.set(fiscalYear, {
        fiscalYear,
        totalValue: values.reduce<number>(
          (sum, value) => sum + (value ?? 0),
          0,
        ),
        sourcePeriods: ['Q1', 'Q2', 'Q3', 'Q4'],
      });
    }

    for (const statement of annualStatements) {
      if (yearlyMap.has(statement.fiscalYear)) {
        continue;
      }

      let totalValue: number | null = null;
      if (metric === 'eps') {
        totalValue = this.toNumber(statement.eps);
      } else {
        totalValue = this.toNumber(statement.revenue);
        if (totalValue !== null) {
          totalValue = await this.normalizeValue(
            totalValue,
            statement.currency || 'IDR',
            companyId,
          );
        }
      }

      if (totalValue === null) {
        continue;
      }

      yearlyMap.set(statement.fiscalYear, {
        fiscalYear: statement.fiscalYear,
        totalValue,
        sourcePeriods: ['ANNUAL'],
      });
    }

    return Array.from(yearlyMap.values()).sort(
      (a, b) => b.fiscalYear - a.fiscalYear,
    );
  }

  private async getAnnualMetricValue(
    fiscalYear: number,
    metric: 'eps' | 'revenue',
    quarterlyStatements: QuarterlyMetricRow[],
    annualStatements: AnnualMetricRow[],
    companyId: string,
  ): Promise<number | null> {
    // 1. Prefer sum of quarters if we have all 4 quarters
    const quarterValues = quarterlyStatements
      .filter(
        (statement) =>
          statement.fiscalYear === fiscalYear && statement.fiscalQuarter,
      )
      .sort((a, b) => (a.fiscalQuarter ?? 0) - (b.fiscalQuarter ?? 0))
      .map((statement) =>
        this.toNumber(metric === 'eps' ? statement.eps : statement.revenue),
      );

    if (
      quarterValues.length === 4 &&
      !quarterValues.some((value) => value === null)
    ) {
      return quarterValues.reduce<number>(
        (sum, value) => sum + (value ?? 0),
        0,
      );
    }

    // 2. Fallback to annual statement
    const annualStatement = annualStatements.find(
      (statement) => statement.fiscalYear === fiscalYear,
    );
    if (annualStatement) {
      if (metric === 'eps') {
        return this.toNumber(annualStatement.eps);
      } else {
        const val = this.toNumber(annualStatement.revenue);
        if (val !== null) {
          return this.normalizeValue(
            val,
            annualStatement.currency || 'IDR',
            companyId,
          );
        }
      }
    }

    return null;
  }

  private async normalizeValue(
    val: number | null | undefined,
    currency: string,
    companyId: string,
  ): Promise<number | null> {
    if (val == null || val === 0) {
      return 0;
    }

    let marketCap: number | null = null;
    let refCurrency = 'IDR';

    const ajaib = await this.prisma.ajaibStockMarket.findFirst({
      where: { listing: { companyId } },
      select: { marketCap: true },
    });
    if (ajaib?.marketCap) {
      marketCap = Number(ajaib.marketCap);
    } else {
      const shares = await this.prisma.sharesData.findFirst({
        where: { companyId },
        orderBy: { date: 'desc' },
        select: { marketCap: true, currency: true },
      });
      if (shares?.marketCap) {
        marketCap = Number(shares.marketCap);
        refCurrency = shares.currency || 'IDR';
      }
    }

    const normCurrency = currency.toUpperCase();
    const normRefCurrency = refCurrency.toUpperCase();

    let refCap = marketCap;
    if (refCap && normCurrency !== normRefCurrency) {
      if (normCurrency === 'USD' && normRefCurrency === 'IDR') {
        refCap = refCap / 15000;
      } else if (normCurrency === 'IDR' && normRefCurrency === 'USD') {
        refCap = refCap * 15000;
      }
    }

    if (refCap) {
      const ratio = refCap / Math.abs(val);
      if (ratio > 500000) {
        return val * 1000000;
      } else if (ratio > 500) {
        return val * 1000;
      }
      return val;
    }

    const absVal = Math.abs(val);
    if (normCurrency === 'IDR') {
      if (absVal < 100000) {
        return val * 1000000000;
      } else if (absVal < 100000000) {
        return val * 1000000;
      } else if (absVal < 100000000000) {
        return val * 1000;
      }
    } else if (normCurrency === 'USD') {
      if (absVal < 50000000) {
        return val * 1000;
      }
    }

    return val;
  }

  private toNumber(value: any): number | null {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private toNullableNumber(value: any): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toText(value: any): string | null {
    if (value === null || value === undefined) return '0';
    return String(value);
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }
}

type RuleCondition =
  | {
      type: 'between';
      min: number;
      max: number;
    }
  | {
      type: 'gte' | 'lte' | 'gt' | 'lt';
      value: number;
    };
