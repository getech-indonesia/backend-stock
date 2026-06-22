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
  };
}

@Injectable()
export class ListingScoreCalculator {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate G (Growth) Score for a listing.
   * G = G1 (EPS YoY consistency) + G2 (ROE)
   * Max: 30 points (16 + 14)
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
      take: 4,
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

    return {
      pillar: 'G',
      score: g1.score + g2.score,
      maxScore: 30,
      details: {
        g1,
        g2,
      },
    };
  }

  private calculateG1(
    quarterlyStatements: {
      fiscalYear: number;
      fiscalQuarter: number | null;
      eps: any;
    }[],
    annualStatements: {
      fiscalYear: number;
      eps: any;
    }[],
  ) {
    const annualSeries = this.buildAnnualEpsSeries(quarterlyStatements, annualStatements);
    const items: G1BreakdownItem[] = [];

    for (let i = 0; i < annualSeries.length - 1; i++) {
      const current = annualSeries[i];
      const previous = annualSeries[i + 1];

      let growthPct: number | null = null;
      if (current.totalEPS !== null && previous.totalEPS !== null && previous.totalEPS !== 0) {
        growthPct = this.round2(
          ((current.totalEPS - previous.totalEPS) / previous.totalEPS) * 100,
        );
      }

      items.push({
        currentYear: current.fiscalYear,
        totalEPS: this.toText(current.totalEPS),
        previousYear: previous.fiscalYear,
        previousTotalEPS: this.toText(previous.totalEPS),
        growthPct,
        formula: `(${this.toText(current.totalEPS) ?? 'null'} - ${this.toText(previous.totalEPS) ?? 'null'}) / ${this.toText(previous.totalEPS) ?? 'null'} x 100`,
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
    incomeStatements: { fiscalYear: number; netIncome: any }[],
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

  private buildAnnualEpsSeries(
    quarterlyStatements: {
      fiscalYear: number;
      fiscalQuarter: number | null;
      eps: any;
    }[],
    annualStatements: {
      fiscalYear: number;
      eps: any;
    }[],
  ) {
    const yearlyMap = new Map<
      number,
      {
        fiscalYear: number;
        totalEPS: number | null;
        sourcePeriods: string[];
      }
    >();

    const grouped = new Map<
      number,
      {
        fiscalQuarter: number;
        eps: number | null;
      }[]
    >();

    for (const statement of quarterlyStatements) {
      if (!statement.fiscalQuarter) {
        continue;
      }

      const bucket = grouped.get(statement.fiscalYear) ?? [];
      bucket.push({
        fiscalQuarter: statement.fiscalQuarter,
        eps: this.toNumber(statement.eps),
      });
      grouped.set(statement.fiscalYear, bucket);
    }

    for (const [fiscalYear, rows] of grouped.entries()) {
      if (rows.length !== 4) {
        continue;
      }

      const sortedRows = rows.slice().sort((a, b) => a.fiscalQuarter - b.fiscalQuarter);
      const epsValues = sortedRows.map((row) => row.eps);

      if (epsValues.some((value) => value === null)) {
        continue;
      }

      yearlyMap.set(fiscalYear, {
        fiscalYear,
        totalEPS: epsValues.reduce<number>((sum, value) => sum + (value ?? 0), 0),
        sourcePeriods: ['Q1', 'Q2', 'Q3', 'Q4'],
      });
    }

    for (const statement of annualStatements) {
      if (yearlyMap.has(statement.fiscalYear)) {
        continue;
      }

      const totalEPS = this.toNumber(statement.eps);
      if (totalEPS === null) {
        continue;
      }

      yearlyMap.set(statement.fiscalYear, {
        fiscalYear: statement.fiscalYear,
        totalEPS,
        sourcePeriods: ['ANNUAL'],
      });
    }

    return Array.from(yearlyMap.values())
      .sort((a, b) => b.fiscalYear - a.fiscalYear)
      .slice(0, 4);
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

