import { Injectable, Logger } from '@nestjs/common';
import { AuditStatus, PeriodType } from '@prisma/client';

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

  constructor(private readonly prisma: PrismaService) {}

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

    for (const company of companies) {
      const symbol = company.listings[0]?.symbol;

      if (!symbol) {
        companiesSkipped++;
        this.logger.warn(
          `Skipping company ${company.id} because it has no listing symbol`,
        );
        continue;
      }

      const payload = await this.fetchFinancialStatement(symbol, year);

      if (!payload) {
        companiesFailed++;
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
        `Financial statement synced for ${symbol} (${company.id}). income=${incomeCount} balance=${balanceCount} cashflow=${cashFlowCount}`,
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
      const revenue = this.toNumberOrNull(item.revenue);
      const netIncome = this.toNumberOrNull(item.netIncome);

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
        revenueGrowthYoY: this.toNumberOrNull(item.revenueGrowthYoY),
        cogs: this.toNumberOrNull(item.cogs),
        grossProfit: this.toNumberOrNull(item.grossProfit),
        operatingExpenses: this.toNumberOrNull(item.operatingExpenses),
        sellingExpenses: this.toNumberOrNull(item.sellingExpenses),
        generalAdminExpenses: this.toNumberOrNull(item.generalAdminExpenses),
        rdExpenses: this.toNumberOrNull(item.rdExpenses),
        depreciationAmort: this.toNumberOrNull(item.depreciationAmort),
        ebit: this.toNumberOrNull(item.ebit),
        ebitda: this.toNumberOrNull(item.ebitda),
        operatingIncome: this.toNumberOrNull(item.operatingIncome),
        interestExpense: this.toNumberOrNull(item.interestExpense),
        interestIncome: this.toNumberOrNull(item.interestIncome),
        otherNonOperatingIncome: this.toNumberOrNull(item.otherNonOperatingIncome),
        pretaxIncome: this.toNumberOrNull(item.pretaxIncome),
        incomeTaxExpense: this.toNumberOrNull(item.incomeTaxExpense),
        effectiveTaxRate: this.toNumberOrNull(item.effectiveTaxRate),
        netIncome,
        netIncomeAttributable: this.toNumberOrNull(item.netIncomeAttributable),
        minorityInterest: this.toNumberOrNull(item.minorityInterest),
        eps: this.toNumberOrNull(item.eps),
        epsDiluted: this.toNumberOrNull(item.epsDiluted),
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
      const totalAssets = this.toNumberOrNull(item.totalAssets);
      const totalEquity = this.toNumberOrNull(item.totalEquity);

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
        cash: this.toNumberOrNull(item.cash),
        shortTermInvestments: this.toNumberOrNull(item.shortTermInvestments),
        accountsReceivable: this.toNumberOrNull(item.accountsReceivable),
        inventory: this.toNumberOrNull(item.inventory),
        otherCurrentAssets: this.toNumberOrNull(item.otherCurrentAssets),
        totalCurrentAssets: this.toNumberOrNull(item.totalCurrentAssets),
        propertyPlantEquipment: this.toNumberOrNull(item.propertyPlantEquipment),
        intangibleAssets: this.toNumberOrNull(item.intangibleAssets),
        goodwill: this.toNumberOrNull(item.goodwill),
        longTermInvestments: this.toNumberOrNull(item.longTermInvestments),
        otherNonCurrentAssets: this.toNumberOrNull(item.otherNonCurrentAssets),
        totalNonCurrentAssets: this.toNumberOrNull(item.totalNonCurrentAssets),
        totalAssets,
        shortTermDebt: this.toNumberOrNull(item.shortTermDebt),
        accountsPayable: this.toNumberOrNull(item.accountsPayable),
        deferredRevenue: this.toNumberOrNull(item.deferredRevenue),
        otherCurrentLiabilities: this.toNumberOrNull(item.otherCurrentLiabilities),
        totalCurrentLiabilities: this.toNumberOrNull(item.totalCurrentLiabilities),
        longTermDebt: this.toNumberOrNull(item.longTermDebt),
        deferredTaxLiabilities: this.toNumberOrNull(item.deferredTaxLiabilities),
        otherNonCurrentLiabilities: this.toNumberOrNull(item.otherNonCurrentLiabilities),
        totalNonCurrentLiabilities: this.toNumberOrNull(item.totalNonCurrentLiabilities),
        totalLiabilities: this.toNumberOrNull(item.totalLiabilities),
        commonStock: this.toNumberOrNull(item.commonStock),
        additionalPaidInCapital: this.toNumberOrNull(item.additionalPaidInCapital),
        retainedEarnings: this.toNumberOrNull(item.retainedEarnings),
        treasuryStock: this.toNumberOrNull(item.treasuryStock),
        otherEquity: this.toNumberOrNull(item.otherEquity),
        minorityInterestEquity: this.toNumberOrNull(item.minorityInterestEquity),
        totalEquity,
        bookValuePerShare: this.toNumberOrNull(item.bookValuePerShare),
        netDebt: this.toNumberOrNull(item.netDebt),
        workingCapital: this.toNumberOrNull(item.workingCapital),
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
      const netCashFromOperations = this.toNumberOrNull(item.netCashFromOperations);

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
        netIncomeStart: this.toNumberOrNull(item.netIncomeStart),
        depreciationAmort: this.toNumberOrNull(item.depreciationAmort),
        stockBasedCompensation: this.toNumberOrNull(item.stockBasedCompensation),
        changeInWorkingCapital: this.toNumberOrNull(item.changeInWorkingCapital),
        changeInReceivables: this.toNumberOrNull(item.changeInReceivables),
        changeInInventory: this.toNumberOrNull(item.changeInInventory),
        changeInPayables: this.toNumberOrNull(item.changeInPayables),
        otherOperatingActivities: this.toNumberOrNull(item.otherOperatingActivities),
        netCashFromOperations,
        capitalExpenditures: this.toNumberOrNull(item.capitalExpenditures),
        acquisitions: this.toNumberOrNull(item.acquisitions),
        purchaseOfInvestments: this.toNumberOrNull(item.purchaseOfInvestments),
        saleOfInvestments: this.toNumberOrNull(item.saleOfInvestments),
        otherInvestingActivities: this.toNumberOrNull(item.otherInvestingActivities),
        netCashFromInvesting: this.toNumberOrNull(item.netCashFromInvesting),
        debtIssuance: this.toNumberOrNull(item.debtIssuance),
        debtRepayment: this.toNumberOrNull(item.debtRepayment),
        commonStockIssuance: this.toNumberOrNull(item.commonStockIssuance),
        commonStockRepurchase: this.toNumberOrNull(item.commonStockRepurchase),
        dividendsPaid: this.toNumberOrNull(item.dividendsPaid),
        otherFinancingActivities: this.toNumberOrNull(item.otherFinancingActivities),
        netCashFromFinancing: this.toNumberOrNull(item.netCashFromFinancing),
        netChangeInCash: this.toNumberOrNull(item.netChangeInCash),
        cashBeginningPeriod: this.toNumberOrNull(item.cashBeginningPeriod),
        cashEndPeriod: this.toNumberOrNull(item.cashEndPeriod),
        freeCashFlow: this.toNumberOrNull(item.freeCashFlow),
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
      const body =
        typeof axiosError.response?.data === 'string'
          ? axiosError.response?.data.slice(0, 200)
          : JSON.stringify(axiosError.response?.data).slice(0, 200);

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

  private toNumberOrNull(value?: number | null): number | null {
    if (value == null) {
      return null;
    }

    if (!Number.isFinite(value)) {
      return null;
    }

    return value;
  }

  private toBigIntOrNull(value?: number | null): bigint | null {
    const parsed = this.toNumberOrNull(value);

    if (parsed == null) {
      return null;
    }

    return BigInt(Math.trunc(parsed));
  }

  private buildPythonBackendUrl(path: string): string {
    return new URL(path, `${this.pythonBackendBaseUrl.replace(/\/+$/, '')}/`).toString();
  }
}
