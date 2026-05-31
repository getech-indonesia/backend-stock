import { Injectable, Logger } from '@nestjs/common';
import { AuditStatus, PeriodType, Prisma } from '@prisma/client';

import axios, { AxiosError } from 'axios';

import { PrismaService } from '../../../prisma/prisma.service';

type StatementPayload<T> = {
  count?: number;
  items?: T[];
};

type IncomeStatementApiItem = {
  period?: string | null;
  fiscalYear?: number | null;
  fiscalQuarter?: number | null;
  periodEndDate?: string | null;
  currency?: string | null;
  auditStatus?: string | null;
  revenue?: number | null;
  revenueGrowthYoY?: number | null;
  cogs?: number | null;
  grossProfit?: number | null;
  operatingExpenses?: number | null;
  sellingExpenses?: number | null;
  generalAdminExpenses?: number | null;
  rdExpenses?: number | null;
  depreciationAmort?: number | null;
  ebit?: number | null;
  ebitda?: number | null;
  operatingIncome?: number | null;
  interestExpense?: number | null;
  interestIncome?: number | null;
  otherNonOperatingIncome?: number | null;
  pretaxIncome?: number | null;
  incomeTaxExpense?: number | null;
  effectiveTaxRate?: number | null;
  netIncome?: number | null;
  netIncomeAttributable?: number | null;
  minorityInterest?: number | null;
  eps?: number | null;
  epsDiluted?: number | null;
  sharesWeightedAvg?: number | null;
};

type BalanceSheetApiItem = {
  period?: string | null;
  fiscalYear?: number | null;
  fiscalQuarter?: number | null;
  periodEndDate?: string | null;
  currency?: string | null;
  auditStatus?: string | null;
  cash?: number | null;
  shortTermInvestments?: number | null;
  accountsReceivable?: number | null;
  inventory?: number | null;
  otherCurrentAssets?: number | null;
  totalCurrentAssets?: number | null;
  propertyPlantEquipment?: number | null;
  intangibleAssets?: number | null;
  goodwill?: number | null;
  longTermInvestments?: number | null;
  otherNonCurrentAssets?: number | null;
  totalNonCurrentAssets?: number | null;
  totalAssets?: number | null;
  shortTermDebt?: number | null;
  accountsPayable?: number | null;
  deferredRevenue?: number | null;
  otherCurrentLiabilities?: number | null;
  totalCurrentLiabilities?: number | null;
  longTermDebt?: number | null;
  deferredTaxLiabilities?: number | null;
  otherNonCurrentLiabilities?: number | null;
  totalNonCurrentLiabilities?: number | null;
  totalLiabilities?: number | null;
  commonStock?: number | null;
  additionalPaidInCapital?: number | null;
  retainedEarnings?: number | null;
  treasuryStock?: number | null;
  otherEquity?: number | null;
  minorityInterestEquity?: number | null;
  totalEquity?: number | null;
  bookValuePerShare?: number | null;
  netDebt?: number | null;
  workingCapital?: number | null;
};

type CashFlowStatementApiItem = {
  period?: string | null;
  fiscalYear?: number | null;
  fiscalQuarter?: number | null;
  periodEndDate?: string | null;
  currency?: string | null;
  auditStatus?: string | null;
  netIncomeStart?: number | null;
  depreciationAmort?: number | null;
  stockBasedCompensation?: number | null;
  changeInWorkingCapital?: number | null;
  changeInReceivables?: number | null;
  changeInInventory?: number | null;
  changeInPayables?: number | null;
  otherOperatingActivities?: number | null;
  netCashFromOperations?: number | null;
  capitalExpenditures?: number | null;
  acquisitions?: number | null;
  purchaseOfInvestments?: number | null;
  saleOfInvestments?: number | null;
  otherInvestingActivities?: number | null;
  netCashFromInvesting?: number | null;
  debtIssuance?: number | null;
  debtRepayment?: number | null;
  commonStockIssuance?: number | null;
  commonStockRepurchase?: number | null;
  dividendsPaid?: number | null;
  otherFinancingActivities?: number | null;
  netCashFromFinancing?: number | null;
  netChangeInCash?: number | null;
  cashBeginningPeriod?: number | null;
  cashEndPeriod?: number | null;
  freeCashFlow?: number | null;
};

type FinancialStatementApiResponse = {
  status?: string;
  symbol?: string;
  year?: number;
  income_statement?: StatementPayload<IncomeStatementApiItem>;
  balance_sheet?: StatementPayload<BalanceSheetApiItem>;
  cash_flow_statement?: StatementPayload<CashFlowStatementApiItem>;
};

type MappedPeriod = {
  period: PeriodType;
  fiscalQuarter: number | null;
};

@Injectable()
export class FinancialStatementSyncService {
  private readonly logger = new Logger(FinancialStatementSyncService.name);

  private readonly pythonBackendBaseUrl =
    process.env.PYTHON_BACKEND_BASE_URL ?? 'http://127.0.0.1:5000/api';

  constructor(private readonly prisma: PrismaService) { }

  async syncAllFromPython(year: number): Promise<{
    year: number;
    companiesProcessed: number;
    companiesSucceeded: number;
    companiesFailed: number;
    companiesSkipped: number;
    incomeStatementsUpserted: number;
    balanceSheetsUpserted: number;
    cashFlowStatementsUpserted: number;
  }> {
    const companies = await this.prisma.company.findMany({
      select: {
        id: true,
        listings: {
          select: {
            symbol: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
          take: 1,
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    let companiesSucceeded = 0;
    let companiesFailed = 0;
    let companiesSkipped = 0;
    let incomeStatementsUpserted = 0;
    let balanceSheetsUpserted = 0;
    let cashFlowStatementsUpserted = 0;

    const totalCompanies = companies.length;
    let currentIndex = 0;

    for (const company of companies) {
      currentIndex++;
      const symbol = company.listings[0]?.symbol;

      if (!symbol) {
        companiesSkipped++;
        this.logger.warn(
          `[${currentIndex}/${totalCompanies}] Skipping company ${company.id} because it has no listing symbol`,
        );
        continue;
      }

      this.logger.log(
        `[${currentIndex}/${totalCompanies}] Sync financial statement for ${symbol} (${company.id}) year=${year} started`,
      );

      const payload = await this.fetchFinancialStatement(symbol, year);

      if (!payload) {
        companiesFailed++;
        this.logger.warn(
          `[${currentIndex}/${totalCompanies}] Failed to fetch financial statement for ${symbol} (${company.id}) year=${year}`,
        );
        continue;
      }

      const incomeCount = await this.upsertIncomeStatements(
        company.id,
        symbol,
        year,
        payload.income_statement?.items ?? [],
      );
      const balanceCount = await this.upsertBalanceSheets(
        company.id,
        symbol,
        year,
        payload.balance_sheet?.items ?? [],
      );
      const cashFlowCount = await this.upsertCashFlowStatements(
        company.id,
        symbol,
        year,
        payload.cash_flow_statement?.items ?? [],
      );

      incomeStatementsUpserted += incomeCount;
      balanceSheetsUpserted += balanceCount;
      cashFlowStatementsUpserted += cashFlowCount;
      companiesSucceeded++;

      this.logger.log(
        `[${currentIndex}/${totalCompanies}] Financial statement synced for ${symbol} (${company.id}). income=${incomeCount} balance=${balanceCount} cashflow=${cashFlowCount}`,
      );
    }

    return {
      year,
      companiesProcessed: companies.length,
      companiesSucceeded,
      companiesFailed,
      companiesSkipped,
      incomeStatementsUpserted,
      balanceSheetsUpserted,
      cashFlowStatementsUpserted,
    };
  }

  private async upsertIncomeStatements(
    companyId: string,
    symbol: string,
    requestedYear: number,
    items: IncomeStatementApiItem[],
  ): Promise<number> {
    let upserted = 0;

    for (const item of items) {
      const mappedPeriod = this.mapPeriod(item.period, item.fiscalQuarter);
      const fiscalYear = this.parseFiscalYear(item.fiscalYear, requestedYear);
      const periodEndDate = this.parseDate(item.periodEndDate);
      const revenue = this.toDecimalOrNull(item.revenue);
      const netIncome = this.toDecimalOrNull(item.netIncome);

      if (!mappedPeriod || !fiscalYear || !periodEndDate || revenue == null || netIncome == null) {
        this.logger.warn(
          `Skipping invalid income statement for ${symbol}. payload=${JSON.stringify(item).slice(0, 200)}`,
        );
        continue;
      }

      const baseData = {
        periodEndDate,
        currency: this.toCurrency(item.currency),
        auditStatus: this.mapAuditStatus(item.auditStatus),
        revenue,
        revenueGrowthYoY: this.toDecimalOrNull(item.revenueGrowthYoY, 8, 4),
        cogs: this.toDecimalOrNull(item.cogs),
        grossProfit: this.toDecimalOrNull(item.grossProfit),
        operatingExpenses: this.toDecimalOrNull(item.operatingExpenses),
        sellingExpenses: this.toDecimalOrNull(item.sellingExpenses),
        generalAdminExpenses: this.toDecimalOrNull(item.generalAdminExpenses),
        rdExpenses: this.toDecimalOrNull(item.rdExpenses),
        depreciationAmort: this.toDecimalOrNull(item.depreciationAmort),
        ebit: this.toDecimalOrNull(item.ebit),
        ebitda: this.toDecimalOrNull(item.ebitda),
        operatingIncome: this.toDecimalOrNull(item.operatingIncome),
        interestExpense: this.toDecimalOrNull(item.interestExpense),
        interestIncome: this.toDecimalOrNull(item.interestIncome),
        otherNonOperatingIncome: this.toDecimalOrNull(item.otherNonOperatingIncome),
        pretaxIncome: this.toDecimalOrNull(item.pretaxIncome),
        incomeTaxExpense: this.toDecimalOrNull(item.incomeTaxExpense),
        effectiveTaxRate: this.toDecimalOrNull(item.effectiveTaxRate, 8, 4),
        netIncome,
        netIncomeAttributable: this.toDecimalOrNull(item.netIncomeAttributable),
        minorityInterest: this.toDecimalOrNull(item.minorityInterest),
        eps: this.toDecimalOrNull(item.eps, 14, 4),
        epsDiluted: this.toDecimalOrNull(item.epsDiluted, 14, 4),
        sharesWeightedAvg: this.toBigIntOrNull(item.sharesWeightedAvg),
      };

      if (mappedPeriod.fiscalQuarter == null) {
        const existing = await this.prisma.incomeStatement.findFirst({
          where: {
            companyId,
            period: mappedPeriod.period,
            fiscalYear,
            fiscalQuarter: null,
          },
          select: {
            id: true,
          },
        });

        if (existing) {
          await this.prisma.incomeStatement.update({
            where: {
              id: existing.id,
            },
            data: baseData,
          });
        } else {
          await this.prisma.incomeStatement.create({
            data: {
              companyId,
              period: mappedPeriod.period,
              fiscalYear,
              fiscalQuarter: null,
              ...baseData,
            },
          });
        }
      } else {
        await this.prisma.incomeStatement.upsert({
          where: {
            companyId_period_fiscalYear_fiscalQuarter: {
              companyId,
              period: mappedPeriod.period,
              fiscalYear,
              fiscalQuarter: mappedPeriod.fiscalQuarter,
            },
          },
          update: baseData,
          create: {
            companyId,
            period: mappedPeriod.period,
            fiscalYear,
            fiscalQuarter: mappedPeriod.fiscalQuarter,
            ...baseData,
          },
        });
      }

      upserted++;
    }

    return upserted;
  }

  private async upsertBalanceSheets(
    companyId: string,
    symbol: string,
    requestedYear: number,
    items: BalanceSheetApiItem[],
  ): Promise<number> {
    let upserted = 0;

    for (const item of items) {
      const mappedPeriod = this.mapPeriod(item.period, item.fiscalQuarter);
      const fiscalYear = this.parseFiscalYear(item.fiscalYear, requestedYear);
      const periodEndDate = this.parseDate(item.periodEndDate);
      const totalAssets = this.toDecimalOrNull(item.totalAssets);
      const totalEquity = this.toDecimalOrNull(item.totalEquity);

      if (!mappedPeriod || !fiscalYear || !periodEndDate || totalAssets == null || totalEquity == null) {
        this.logger.warn(
          `Skipping invalid balance sheet for ${symbol}. payload=${JSON.stringify(item).slice(0, 200)}`,
        );
        continue;
      }

      const baseData = {
        periodEndDate,
        currency: this.toCurrency(item.currency),
        auditStatus: this.mapAuditStatus(item.auditStatus),
        cash: this.toDecimalOrNull(item.cash),
        shortTermInvestments: this.toDecimalOrNull(item.shortTermInvestments),
        accountsReceivable: this.toDecimalOrNull(item.accountsReceivable),
        inventory: this.toDecimalOrNull(item.inventory),
        otherCurrentAssets: this.toDecimalOrNull(item.otherCurrentAssets),
        totalCurrentAssets: this.toDecimalOrNull(item.totalCurrentAssets),
        propertyPlantEquipment: this.toDecimalOrNull(item.propertyPlantEquipment),
        intangibleAssets: this.toDecimalOrNull(item.intangibleAssets),
        goodwill: this.toDecimalOrNull(item.goodwill),
        longTermInvestments: this.toDecimalOrNull(item.longTermInvestments),
        otherNonCurrentAssets: this.toDecimalOrNull(item.otherNonCurrentAssets),
        totalNonCurrentAssets: this.toDecimalOrNull(item.totalNonCurrentAssets),
        totalAssets,
        shortTermDebt: this.toDecimalOrNull(item.shortTermDebt),
        accountsPayable: this.toDecimalOrNull(item.accountsPayable),
        deferredRevenue: this.toDecimalOrNull(item.deferredRevenue),
        otherCurrentLiabilities: this.toDecimalOrNull(item.otherCurrentLiabilities),
        totalCurrentLiabilities: this.toDecimalOrNull(item.totalCurrentLiabilities),
        longTermDebt: this.toDecimalOrNull(item.longTermDebt),
        deferredTaxLiabilities: this.toDecimalOrNull(item.deferredTaxLiabilities),
        otherNonCurrentLiabilities: this.toDecimalOrNull(item.otherNonCurrentLiabilities),
        totalNonCurrentLiabilities: this.toDecimalOrNull(item.totalNonCurrentLiabilities),
        totalLiabilities: this.toDecimalOrNull(item.totalLiabilities),
        commonStock: this.toDecimalOrNull(item.commonStock),
        additionalPaidInCapital: this.toDecimalOrNull(item.additionalPaidInCapital),
        retainedEarnings: this.toDecimalOrNull(item.retainedEarnings),
        treasuryStock: this.toDecimalOrNull(item.treasuryStock),
        otherEquity: this.toDecimalOrNull(item.otherEquity),
        minorityInterestEquity: this.toDecimalOrNull(item.minorityInterestEquity),
        totalEquity,
        bookValuePerShare: this.toDecimalOrNull(item.bookValuePerShare, 14, 4),
        netDebt: this.toDecimalOrNull(item.netDebt),
        workingCapital: this.toDecimalOrNull(item.workingCapital),
      };

      if (mappedPeriod.fiscalQuarter == null) {
        const existing = await this.prisma.balanceSheet.findFirst({
          where: {
            companyId,
            period: mappedPeriod.period,
            fiscalYear,
            fiscalQuarter: null,
          },
          select: {
            id: true,
          },
        });

        if (existing) {
          await this.prisma.balanceSheet.update({
            where: {
              id: existing.id,
            },
            data: baseData,
          });
        } else {
          await this.prisma.balanceSheet.create({
            data: {
              companyId,
              period: mappedPeriod.period,
              fiscalYear,
              fiscalQuarter: null,
              ...baseData,
            },
          });
        }
      } else {
        await this.prisma.balanceSheet.upsert({
          where: {
            companyId_period_fiscalYear_fiscalQuarter: {
              companyId,
              period: mappedPeriod.period,
              fiscalYear,
              fiscalQuarter: mappedPeriod.fiscalQuarter,
            },
          },
          update: baseData,
          create: {
            companyId,
            period: mappedPeriod.period,
            fiscalYear,
            fiscalQuarter: mappedPeriod.fiscalQuarter,
            ...baseData,
          },
        });
      }

      upserted++;
    }

    return upserted;
  }

  private async upsertCashFlowStatements(
    companyId: string,
    symbol: string,
    requestedYear: number,
    items: CashFlowStatementApiItem[],
  ): Promise<number> {
    let upserted = 0;

    for (const item of items) {
      const mappedPeriod = this.mapPeriod(item.period, item.fiscalQuarter);
      const fiscalYear = this.parseFiscalYear(item.fiscalYear, requestedYear);
      const periodEndDate = this.parseDate(item.periodEndDate);
      const netCashFromOperations = this.toDecimalOrNull(item.netCashFromOperations);

      if (!mappedPeriod || !fiscalYear || !periodEndDate || netCashFromOperations == null) {
        this.logger.warn(
          `Skipping invalid cash flow statement for ${symbol}. payload=${JSON.stringify(item).slice(0, 200)}`,
        );
        continue;
      }

      const baseData = {
        periodEndDate,
        currency: this.toCurrency(item.currency),
        auditStatus: this.mapAuditStatus(item.auditStatus),
        netIncomeStart: this.toDecimalOrNull(item.netIncomeStart),
        depreciationAmort: this.toDecimalOrNull(item.depreciationAmort),
        stockBasedCompensation: this.toDecimalOrNull(item.stockBasedCompensation),
        changeInWorkingCapital: this.toDecimalOrNull(item.changeInWorkingCapital),
        changeInReceivables: this.toDecimalOrNull(item.changeInReceivables),
        changeInInventory: this.toDecimalOrNull(item.changeInInventory),
        changeInPayables: this.toDecimalOrNull(item.changeInPayables),
        otherOperatingActivities: this.toDecimalOrNull(item.otherOperatingActivities),
        netCashFromOperations,
        capitalExpenditures: this.toDecimalOrNull(item.capitalExpenditures),
        acquisitions: this.toDecimalOrNull(item.acquisitions),
        purchaseOfInvestments: this.toDecimalOrNull(item.purchaseOfInvestments),
        saleOfInvestments: this.toDecimalOrNull(item.saleOfInvestments),
        otherInvestingActivities: this.toDecimalOrNull(item.otherInvestingActivities),
        netCashFromInvesting: this.toDecimalOrNull(item.netCashFromInvesting),
        debtIssuance: this.toDecimalOrNull(item.debtIssuance),
        debtRepayment: this.toDecimalOrNull(item.debtRepayment),
        commonStockIssuance: this.toDecimalOrNull(item.commonStockIssuance),
        commonStockRepurchase: this.toDecimalOrNull(item.commonStockRepurchase),
        dividendsPaid: this.toDecimalOrNull(item.dividendsPaid),
        otherFinancingActivities: this.toDecimalOrNull(item.otherFinancingActivities),
        netCashFromFinancing: this.toDecimalOrNull(item.netCashFromFinancing),
        netChangeInCash: this.toDecimalOrNull(item.netChangeInCash),
        cashBeginningPeriod: this.toDecimalOrNull(item.cashBeginningPeriod),
        cashEndPeriod: this.toDecimalOrNull(item.cashEndPeriod),
        freeCashFlow: this.toDecimalOrNull(item.freeCashFlow),
      };

      if (mappedPeriod.fiscalQuarter == null) {
        const existing = await this.prisma.cashFlowStatement.findFirst({
          where: {
            companyId,
            period: mappedPeriod.period,
            fiscalYear,
            fiscalQuarter: null,
          },
          select: {
            id: true,
          },
        });

        if (existing) {
          await this.prisma.cashFlowStatement.update({
            where: {
              id: existing.id,
            },
            data: baseData,
          });
        } else {
          await this.prisma.cashFlowStatement.create({
            data: {
              companyId,
              period: mappedPeriod.period,
              fiscalYear,
              fiscalQuarter: null,
              ...baseData,
            },
          });
        }
      } else {
        await this.prisma.cashFlowStatement.upsert({
          where: {
            companyId_period_fiscalYear_fiscalQuarter: {
              companyId,
              period: mappedPeriod.period,
              fiscalYear,
              fiscalQuarter: mappedPeriod.fiscalQuarter,
            },
          },
          update: baseData,
          create: {
            companyId,
            period: mappedPeriod.period,
            fiscalYear,
            fiscalQuarter: mappedPeriod.fiscalQuarter,
            ...baseData,
          },
        });
      }

      upserted++;
    }

    return upserted;
  }

  private async fetchFinancialStatement(
    symbol: string,
    year: number,
  ): Promise<FinancialStatementApiResponse | null> {
    const endpoint = this.buildPythonBackendUrl('financial-statement');

    try {
      const response = await axios.get<FinancialStatementApiResponse>(endpoint, {
        params: {
          symbol,
          year,
        },
        timeout: 30000,
      });

      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status;
      const body = this.toLogSnippet(axiosError.response?.data);

      this.logger.warn(
        `Failed to fetch financial statement for ${symbol} year=${year}. status=${status ?? 'N/A'} body=${body ?? 'N/A'}`,
      );
      return null;
    }
  }

  private mapPeriod(
    period?: string | null,
    fiscalQuarter?: number | null,
  ): MappedPeriod | null {
    const normalized = period?.trim().toUpperCase();

    if (normalized === 'Q1') {
      return { period: PeriodType.Q1, fiscalQuarter: 1 };
    }
    if (normalized === 'Q2') {
      return { period: PeriodType.Q2, fiscalQuarter: 2 };
    }
    if (normalized === 'Q3') {
      return { period: PeriodType.Q3, fiscalQuarter: 3 };
    }
    if (normalized === 'Q4') {
      return { period: PeriodType.Q4, fiscalQuarter: 4 };
    }
    if (normalized === 'AUDIT' || normalized === 'ANNUAL') {
      return { period: PeriodType.ANNUAL, fiscalQuarter: null };
    }

    if (fiscalQuarter != null && Number.isInteger(fiscalQuarter)) {
      if (fiscalQuarter === 1) {
        return { period: PeriodType.Q1, fiscalQuarter: 1 };
      }
      if (fiscalQuarter === 2) {
        return { period: PeriodType.Q2, fiscalQuarter: 2 };
      }
      if (fiscalQuarter === 3) {
        return { period: PeriodType.Q3, fiscalQuarter: 3 };
      }
      if (fiscalQuarter === 4) {
        return { period: PeriodType.Q4, fiscalQuarter: 4 };
      }
    }

    if (!normalized && fiscalQuarter == null) {
      return { period: PeriodType.ANNUAL, fiscalQuarter: null };
    }

    return null;
  }

  private mapAuditStatus(value?: string | null): AuditStatus {
    const normalized = value?.trim().toUpperCase();

    if (normalized === 'AUDITED') {
      return AuditStatus.AUDITED;
    }
    if (normalized === 'REVIEWED') {
      return AuditStatus.REVIEWED;
    }

    return AuditStatus.UNAUDITED;
  }

  private parseFiscalYear(
    value: number | null | undefined,
    fallbackYear: number,
  ): number | null {
    const year = value ?? fallbackYear;

    if (!Number.isInteger(year) || year < 1900 || year > 9999) {
      return null;
    }

    return year;
  }

  private parseDate(value?: string | null): Date | null {
    if (!value) {
      return null;
    }

    const normalized = value.slice(0, 10);
    const parsed = new Date(`${normalized}T00:00:00.000Z`);

    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed;
  }

  private toCurrency(value?: string | null): string {
    const currency = value?.trim().toUpperCase();
    return currency ? currency : 'IDR';
  }

  private toDecimalOrNull(
    value?: number | string | null,
    precision = 24,
    scale = 2,
  ): string | null {
    if (value == null) {
      return null;
    }

    const decimal = new Prisma.Decimal(value);

    if (!decimal.isFinite()) {
      return null;
    }

    const rounded = decimal.toDecimalPlaces(scale, Prisma.Decimal.ROUND_HALF_UP);
    const fixed = rounded.toFixed(scale);
    const integerDigits = fixed.replace(/^-/, '').split('.')[0].replace(/^0+/, '').length;

    if (integerDigits > precision - scale) {
      return null;
    }

    return fixed;
  }

  private toBigIntOrNull(value?: number | null): bigint | null {
    const parsed = this.toDecimalOrNull(value);

    if (parsed == null) {
      return null;
    }

    return BigInt(parsed.split('.')[0]);
  }

  private buildPythonBackendUrl(path: string): string {
    return new URL(path, `${this.pythonBackendBaseUrl.replace(/\/+$/, '')}/`).toString();
  }

  private toLogSnippet(data: unknown, maxLength = 200): string | null {
    if (data == null) {
      return null;
    }

    if (typeof data === 'string') {
      return data.slice(0, maxLength);
    }

    const serialized = JSON.stringify(data);
    return typeof serialized === 'string'
      ? serialized.slice(0, maxLength)
      : String(data).slice(0, maxLength);
  }
}
