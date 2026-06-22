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
};

type AnnualMetricRow = {
  fiscalYear: number;
  eps: any;
  revenue: any;
  netIncome?: any;
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

    const balanceSheets = await this.prisma.balanceSheet.findMany({
      where: {
        companyId,
        period: 'ANNUAL',
      },
      orderBy: { fiscalYear: 'desc' },
      take: 1,
    });

    const g1 = this.calculateG1(quarterlyIncomeStatements, annualIncomeStatements);
    const g2 = this.calculateG2(annualIncomeStatements, balanceSheets);
    const g3 = this.calculateForwardGrowth(
      quarterlyIncomeStatements,
      annualIncomeStatements,
      'eps',
      'EPS Growth Expected',
      40,
      'EPS TTM = current-year actual quarters + previous-year same quarters for missing quarters. Score: >25% = 40, >15% = 30, >5% = 20, >0% = 9, <=0% = 0.',
    );
    const g4 = this.calculateForwardGrowth(
      quarterlyIncomeStatements,
      annualIncomeStatements,
      'revenue',
      'Revenue Growth Expected',
      30,
      'Revenue TTM = current-year actual quarters + previous-year same quarters for missing quarters. Score: >20% = 30, >10% = 23, >3% = 13, >0% = 7, <=0% = 0.',
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

  private calculateG1(
    quarterlyStatements: QuarterlyMetricRow[],
    annualStatements: AnnualMetricRow[],
  ) {
    const annualSeries = this.buildAnnualSeries(quarterlyStatements, annualStatements, 'eps');
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
      name: 'EPS YoY 3 Tahun Konsistensi',
      score,
      maxScore: 16,
      rule:
        'Hitung 3 YoY EPS growth terakhir dari total EPS tahunan (Q1-Q4). 16 jika semua > 15%, 12 jika semua positif dan minimal 1 > 15%, 8 jika semua positif dan semuanya <= 15%, 4 jika hanya 2 dari 3 positif, 0 jika mayoritas negatif.',
      items,
    };
  }

  private calculateG2(
    incomeStatements: AnnualMetricRow[],
    balanceSheets: { fiscalYear: number; totalEquity: any }[],
  ) {
    const latestIncome = incomeStatements[0] ?? null;
    const latestBalance = latestIncome
      ? balanceSheets.find((sheet) => sheet.fiscalYear === latestIncome.fiscalYear) ??
        balanceSheets[0] ??
        null
      : balanceSheets[0] ?? null;

    const netIncome = latestIncome ? this.toNumber(latestIncome.netIncome) : null;
    const totalEquity = latestBalance ? this.toNumber(latestBalance.totalEquity) : null;

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
      rule: 'ROE = Net Income / Equity. 14 jika > 20%, 10 jika 15-20%, 6 jika 10-15%, 2 jika 5-10%, 0 jika < 5%.',
      latestYear: latestIncome?.fiscalYear ?? null,
      netIncome: this.toText(latestIncome?.netIncome),
      totalEquity: this.toText(latestBalance?.totalEquity),
      roePct,
      formula: `ROE = ${this.toText(latestIncome?.netIncome) ?? 'null'} / ${this.toText(latestBalance?.totalEquity) ?? 'null'} x 100`,
    };
  }

  private calculateForwardGrowth(
    quarterlyStatements: QuarterlyMetricRow[],
    annualStatements: AnnualMetricRow[],
    metric: 'eps' | 'revenue',
    name: string,
    maxScore: number,
    rule: string,
  ): GForwardBreakdown & { name: string; score: number; maxScore: number; rule: string } {
    const series = this.buildForwardTtmSeries(quarterlyStatements, annualStatements, metric);

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

  private buildForwardTtmSeries(
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

    const previousTotal = this.getAnnualMetricValue(previousYear, metric, quarterlyStatements, annualStatements);
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

  private buildAnnualSeries(
    quarterlyStatements: QuarterlyMetricRow[],
    annualStatements: AnnualMetricRow[],
    metric: 'eps' | 'revenue',
  ): AnnualMetricSeries[] {
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

      const totalValue = this.toNumber(metric === 'eps' ? statement.eps : statement.revenue);
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

  private getAnnualMetricValue(
    fiscalYear: number,
    metric: 'eps' | 'revenue',
    quarterlyStatements: QuarterlyMetricRow[],
    annualStatements: AnnualMetricRow[],
  ): number | null {
    const annualStatement = annualStatements.find((statement) => statement.fiscalYear === fiscalYear);
    const annualValue = annualStatement ? this.toNumber(metric === 'eps' ? annualStatement.eps : annualStatement.revenue) : null;
    if (annualValue !== null) {
      return annualValue;
    }

    const quarterValues = quarterlyStatements
      .filter((statement) => statement.fiscalYear === fiscalYear && statement.fiscalQuarter)
      .sort((a, b) => (a.fiscalQuarter ?? 0) - (b.fiscalQuarter ?? 0))
      .map((statement) => this.toNumber(metric === 'eps' ? statement.eps : statement.revenue));

    if (quarterValues.length !== 4 || quarterValues.some((value) => value === null)) {
      return null;
    }

    return quarterValues.reduce<number>((sum, value) => sum + (value ?? 0), 0);
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





