import { Injectable } from '@nestjs/common';
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

@Injectable()
export class ListingScoreCalculator {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate G (Growth) Score for a listing.
   * G = G1 (EPS YoY consistency) + G2 (ROE) + G3 (EPS Growth Expected) + G4 (Revenue Growth Expected)
   * Max: 100 points (16 + 14 + 40 + 30)
   */
  async calculateGScore(companyId: string): Promise<GrowthScoreResult> {
    const quarterlyIncomeStatements = await this.prisma.incomeStatement.findMany({
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

    const g1 = await this.calculateG1(companyId, quarterlyIncomeStatements, annualIncomeStatements);
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

  private async calculateG1(
    companyId: string,
    quarterlyStatements: QuarterlyMetricRow[],
    annualStatements: AnnualMetricRow[],
  ) {
    const annualSeries = (
      await this.buildAnnualSeries(companyId, quarterlyStatements, annualStatements, 'eps')
    ).slice(0, 4);
    const items: G1BreakdownItem[] = [];

    for (let i = 0; i < annualSeries.length - 1; i++) {
      const current = annualSeries[i];
      const previous = annualSeries[i + 1];

      let growthPct: number | null = null;
      if (current.totalValue !== null && previous.totalValue !== null && previous.totalValue !== 0) {
        growthPct = this.round2(((current.totalValue - previous.totalValue) / previous.totalValue) * 100);
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

    const validGrowths = items.filter((item) => item.growthPct !== null) as Array<
      G1BreakdownItem & { growthPct: number }
    >;

    const positiveCount = validGrowths.filter((item) => item.growthPct > 0).length;
    const over15Count = validGrowths.filter((item) => item.growthPct > 15).length;

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
      rule:
        'Hitung 3 YoY EPS growth terakhir dari total EPS tahunan (Q1-Q4). 16 jika semua > 15%, 12 jika semua positif dan minimal 1 > 15%, 8 jika semua positif dan semuanya <= 15%, 4 jika hanya 2 dari 3 positif, 0 jika mayoritas negatif.',
      items,
    };
  }

  private async calculateG2(
    companyId: string,
    quarterlyIncomeStatements: QuarterlyMetricRow[],
    annualIncomeStatements: AnnualMetricRow[],
    quarterlyBalanceSheets: { fiscalYear: number; totalEquity: any; currency: string }[],
    annualBalanceSheets: { fiscalYear: number; totalEquity: any; currency: string }[],
  ) {
    const latestIncome = annualIncomeStatements[0] ?? null;
    const latestYear = latestIncome?.fiscalYear ?? null;

    let netIncome: number | null = null;
    let totalEquity: number | null = null;

    if (latestYear !== null) {
      // Sum net income from quarters if available
      const yearQuartersIS = quarterlyIncomeStatements.filter((s) => s.fiscalYear === latestYear);
      if (yearQuartersIS.length > 0) {
        netIncome = yearQuartersIS.reduce(
          (sum, s) => sum + (this.toNumber(s.netIncomeAttributable ?? s.netIncome) ?? 0),
          0,
        );
      } else {
        const annualIncome = annualIncomeStatements.find((s) => s.fiscalYear === latestYear);
        netIncome = annualIncome
          ? this.toNumber(annualIncome.netIncomeAttributable ?? annualIncome.netIncome)
          : null;
        if (netIncome !== null) {
          netIncome = await this.normalizeValue(netIncome, annualIncome?.currency || 'IDR', companyId);
        }
      }

      // Sum total equity from quarters if available
      const yearQuartersBS = quarterlyBalanceSheets.filter((s) => s.fiscalYear === latestYear);
      if (yearQuartersBS.length > 0) {
        totalEquity = yearQuartersBS.reduce(
          (sum, s) => sum + (this.toNumber(s.totalEquity) ?? 0),
          0,
        );
      } else {
        const annualBalance = annualBalanceSheets.find((s) => s.fiscalYear === latestYear) ??
          annualBalanceSheets[0] ??
          null;
        totalEquity = annualBalance ? this.toNumber(annualBalance.totalEquity) : null;
        if (totalEquity !== null) {
          totalEquity = await this.normalizeValue(totalEquity, annualBalance?.currency || 'IDR', companyId);
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
  ): Promise<GForwardBreakdown & { name: string; score: number; maxScore: number; rule: string }> {
    const series = await this.buildForwardTtmSeries(companyId, quarterlyStatements, annualStatements, metric);

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

    const { forecastYear, latestQuarter, currentTotal, previousYear, previousTotal, sourcePeriods } = series;

    let growthPct: number | null = null;
    if (currentTotal !== null && previousTotal !== null && previousTotal !== 0) {
      growthPct = this.round2(((currentTotal - previousTotal) / previousTotal) * 100);
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

  private scoreForwardGrowth(metric: 'eps' | 'revenue', growthPct: number | null): number {
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

      const yearMap = grouped.get(statement.fiscalYear) ?? new Map<number, QuarterlyMetricRow>();
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
      const value = row ? this.toNumber(metric === 'eps' ? row.eps : row.revenue) : null;
      if (value === null) {
        return null;
      }

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
      const carryValue = carryRow ? this.toNumber(metric === 'eps' ? carryRow.eps : carryRow.revenue) : null;
      if (carryValue === null) {
        return null;
      }

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
    const grouped = new Map<number, { fiscalQuarter: number; value: number | null }[]>();

    for (const statement of quarterlyStatements) {
      if (!statement.fiscalQuarter) {
        continue;
      }

      const bucket = grouped.get(statement.fiscalYear) ?? [];
      bucket.push({
        fiscalQuarter: statement.fiscalQuarter,
        value: this.toNumber(metric === 'eps' ? statement.eps : statement.revenue),
      });
      grouped.set(statement.fiscalYear, bucket);
    }

    for (const [fiscalYear, rows] of grouped.entries()) {
      if (rows.length !== 4) {
        continue;
      }

      const sortedRows = rows.slice().sort((a, b) => a.fiscalQuarter - b.fiscalQuarter);
      const values = sortedRows.map((row) => row.value);
      if (values.some((value) => value === null)) {
        continue;
      }

      yearlyMap.set(fiscalYear, {
        fiscalYear,
        totalValue: values.reduce<number>((sum, value) => sum + (value ?? 0), 0),
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
          totalValue = await this.normalizeValue(totalValue, statement.currency || 'IDR', companyId);
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

    return Array.from(yearlyMap.values()).sort((a, b) => b.fiscalYear - a.fiscalYear);
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
      .filter((statement) => statement.fiscalYear === fiscalYear && statement.fiscalQuarter)
      .sort((a, b) => (a.fiscalQuarter ?? 0) - (b.fiscalQuarter ?? 0))
      .map((statement) => this.toNumber(metric === 'eps' ? statement.eps : statement.revenue));

    if (quarterValues.length === 4 && !quarterValues.some((value) => value === null)) {
      return quarterValues.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    }

    // 2. Fallback to annual statement
    const annualStatement = annualStatements.find((statement) => statement.fiscalYear === fiscalYear);
    if (annualStatement) {
      if (metric === 'eps') {
        return this.toNumber(annualStatement.eps);
      } else {
        const val = this.toNumber(annualStatement.revenue);
        if (val !== null) {
          return this.normalizeValue(val, annualStatement.currency || 'IDR', companyId);
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
      return val ?? null;
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
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return value;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toText(value: any): string | null {
    if (value === null || value === undefined) return null;
    return String(value);
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }
}






