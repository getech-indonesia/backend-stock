import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditStatus, PeriodType, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AdminIncomeStatementsQueryDto } from './dto/admin-income-statements-query.dto';

@Injectable()
export class IncomeStatementsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllAdmin(query: AdminIncomeStatementsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const keyword = query.keyword?.trim() ?? query.q?.trim();

    const filters: Prisma.IncomeStatementWhereInput[] = [];

    if (keyword) {
      filters.push({
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
      });
    }

    if (query.period) {
      filters.push({
        period: query.period,
      });
    }

    const where =
      filters.length > 0
        ? {
            AND: filters,
          }
        : undefined;

    const [items, total] = await Promise.all([
      this.prisma.incomeStatement.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [
          { fiscalYear: 'desc' },
          { fiscalQuarter: 'desc' },
          { periodEndDate: 'desc' },
        ],
        include: {
          company: {
            select: {
              id: true,
              displayName: true,
              legalName: true,
              logoUrl: true,
            },
          },
        },
      }),
      this.prisma.incomeStatement.count({ where }),
    ]);

    return {
      items: items.map((item) => this.mapIncomeStatement(item)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }

  async findOneAdmin(id: string) {
    const incomeStatement = await this.prisma.incomeStatement.findUnique({
      where: { id },
      include: {
        company: {
          select: {
            id: true,
            displayName: true,
            legalName: true,
            logoUrl: true,
          },
        },
      },
    });

    if (!incomeStatement) {
      throw new NotFoundException(`Income statement ${id} not found`);
    }

    return this.mapIncomeStatement(incomeStatement);
  }

  async createAdmin(body: Record<string, unknown>) {
    const data = this.buildCreateData(body);
    const incomeStatement = await this.prisma.incomeStatement.create({
      data,
      include: {
        company: {
          select: {
            id: true,
            displayName: true,
            legalName: true,
            logoUrl: true,
          },
        },
      },
    });

    return this.mapIncomeStatement(incomeStatement);
  }

  async updateAdmin(id: string, body: Record<string, unknown>) {
    await this.ensureIncomeStatementExists(id);

    const data = this.buildUpdateData(body);
    const incomeStatement = await this.prisma.incomeStatement.update({
      where: { id },
      data,
      include: {
        company: {
          select: {
            id: true,
            displayName: true,
            legalName: true,
            logoUrl: true,
          },
        },
      },
    });

    return this.mapIncomeStatement(incomeStatement);
  }

  private async ensureIncomeStatementExists(id: string) {
    const exists = await this.prisma.incomeStatement.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException(`Income statement ${id} not found`);
    }
  }

  private buildCreateData(body: Record<string, unknown>): Prisma.IncomeStatementUncheckedCreateInput {
    const requiredFields = [
      'companyId',
      'period',
      'fiscalYear',
      'periodEndDate',
      'currency',
      'revenue',
      'netIncome',
    ] as const;

    for (const field of requiredFields) {
      if (body[field] === undefined || body[field] === null || body[field] === '') {
        throw new BadRequestException(`Field ${field} is required`);
      }
    }

    return this.buildIncomeStatementData(body, true) as Prisma.IncomeStatementUncheckedCreateInput;
  }

  private buildUpdateData(body: Record<string, unknown>): Prisma.IncomeStatementUncheckedUpdateInput {
    return this.buildIncomeStatementData(body, false) as Prisma.IncomeStatementUncheckedUpdateInput;
  }

  private buildIncomeStatementData(
    body: Record<string, unknown>,
    isCreate: boolean,
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {};

    this.setString(data, body, 'companyId', isCreate);
    this.setEnum(data, body, 'period', isCreate);
    this.setInt(data, body, 'fiscalYear', isCreate);
    this.setOptionalInt(data, body, 'fiscalQuarter');
    this.setDate(data, body, 'periodEndDate', isCreate);
    this.setString(data, body, 'currency', isCreate);
    this.setEnum(data, body, 'auditStatus');

    this.setDecimal(data, body, 'revenue', isCreate);
    this.setDecimal(data, body, 'revenueGrowthYoY');
    this.setDecimal(data, body, 'cogs');
    this.setDecimal(data, body, 'grossProfit');
    this.setDecimal(data, body, 'operatingExpenses');
    this.setDecimal(data, body, 'sellingExpenses');
    this.setDecimal(data, body, 'generalAdminExpenses');
    this.setDecimal(data, body, 'rdExpenses');
    this.setDecimal(data, body, 'depreciationAmort');
    this.setDecimal(data, body, 'ebit');
    this.setDecimal(data, body, 'ebitda');
    this.setDecimal(data, body, 'operatingIncome');
    this.setDecimal(data, body, 'interestExpense');
    this.setDecimal(data, body, 'interestIncome');
    this.setDecimal(data, body, 'otherNonOperatingIncome');
    this.setDecimal(data, body, 'pretaxIncome');
    this.setDecimal(data, body, 'incomeTaxExpense');
    this.setDecimal(data, body, 'effectiveTaxRate');
    this.setDecimal(data, body, 'netIncome', isCreate);
    this.setDecimal(data, body, 'netIncomeAttributable');
    this.setDecimal(data, body, 'minorityInterest');
    this.setDecimal(data, body, 'eps');
    this.setDecimal(data, body, 'epsDiluted');
    this.setBigInt(data, body, 'sharesWeightedAvg');

    return data;
  }

  private setString(
    target: Record<string, unknown>,
    body: Record<string, unknown>,
    key: string,
    required = false,
  ) {
    const value = body[key];
    if (value === undefined || value === null || value === '') {
      if (required) {
        throw new BadRequestException(`Field ${key} is required`);
      }
      return;
    }

    target[key] = String(value);
  }

  private setInt(
    target: Record<string, unknown>,
    body: Record<string, unknown>,
    key: string,
    required = false,
  ) {
    const value = body[key];
    if (value === undefined || value === null || value === '') {
      if (required) {
        throw new BadRequestException(`Field ${key} is required`);
      }
      return;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      throw new BadRequestException(`Field ${key} must be an integer`);
    }

    target[key] = parsed;
  }

  private setOptionalInt(
    target: Record<string, unknown>,
    body: Record<string, unknown>,
    key: string,
  ) {
    const value = body[key];
    if (value === undefined || value === null || value === '') {
      return;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      throw new BadRequestException(`Field ${key} must be an integer`);
    }

    target[key] = parsed;
  }

  private setDate(
    target: Record<string, unknown>,
    body: Record<string, unknown>,
    key: string,
    required = false,
  ) {
    const value = body[key];
    if (value === undefined || value === null || value === '') {
      if (required) {
        throw new BadRequestException(`Field ${key} is required`);
      }
      return;
    }

    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Field ${key} must be a valid date`);
    }

    target[key] = date;
  }

  private setEnum(
    target: Record<string, unknown>,
    body: Record<string, unknown>,
    key: string,
    required = false,
  ) {
    const value = body[key];
    if (value === undefined || value === null || value === '') {
      if (required) {
        throw new BadRequestException(`Field ${key} is required`);
      }
      return;
    }

    target[key] = value;
  }

  private setDecimal(
    target: Record<string, unknown>,
    body: Record<string, unknown>,
    key: string,
    required = false,
  ) {
    const value = body[key];
    if (value === undefined || value === null || value === '') {
      if (required) {
        throw new BadRequestException(`Field ${key} is required`);
      }
      return;
    }

    target[key] = new Prisma.Decimal(String(value));
  }

  private setBigInt(
    target: Record<string, unknown>,
    body: Record<string, unknown>,
    key: string,
  ) {
    const value = body[key];
    if (value === undefined || value === null || value === '') {
      return;
    }

    target[key] = BigInt(String(value));
  }

  private mapIncomeStatement(item: {
    id: string;
    companyId: string;
    period: PeriodType;
    fiscalYear: number;
    fiscalQuarter: number | null;
    periodEndDate: Date;
    currency: string;
    auditStatus: AuditStatus;
    revenue: Prisma.Decimal;
    revenueGrowthYoY: Prisma.Decimal | null;
    cogs: Prisma.Decimal | null;
    grossProfit: Prisma.Decimal | null;
    operatingExpenses: Prisma.Decimal | null;
    sellingExpenses: Prisma.Decimal | null;
    generalAdminExpenses: Prisma.Decimal | null;
    rdExpenses: Prisma.Decimal | null;
    depreciationAmort: Prisma.Decimal | null;
    ebit: Prisma.Decimal | null;
    ebitda: Prisma.Decimal | null;
    operatingIncome: Prisma.Decimal | null;
    interestExpense: Prisma.Decimal | null;
    interestIncome: Prisma.Decimal | null;
    otherNonOperatingIncome: Prisma.Decimal | null;
    pretaxIncome: Prisma.Decimal | null;
    incomeTaxExpense: Prisma.Decimal | null;
    effectiveTaxRate: Prisma.Decimal | null;
    netIncome: Prisma.Decimal;
    netIncomeAttributable: Prisma.Decimal | null;
    minorityInterest: Prisma.Decimal | null;
    eps: Prisma.Decimal | null;
    epsDiluted: Prisma.Decimal | null;
    sharesWeightedAvg: bigint | null;
    createdAt: Date;
    updatedAt: Date;
    company: {
      id: string;
      displayName: string;
      legalName: string;
      logoUrl: string | null;
    };
  }) {
    return {
      id: item.id,
      companyId: item.companyId,
      period: item.period,
      fiscalYear: item.fiscalYear,
      fiscalQuarter: item.fiscalQuarter,
      periodEndDate: item.periodEndDate.toISOString(),
      currency: item.currency,
      auditStatus: item.auditStatus,
      revenue: item.revenue.toString(),
      revenueGrowthYoY: item.revenueGrowthYoY?.toString() ?? null,
      cogs: item.cogs?.toString() ?? null,
      grossProfit: item.grossProfit?.toString() ?? null,
      operatingExpenses: item.operatingExpenses?.toString() ?? null,
      sellingExpenses: item.sellingExpenses?.toString() ?? null,
      generalAdminExpenses: item.generalAdminExpenses?.toString() ?? null,
      rdExpenses: item.rdExpenses?.toString() ?? null,
      depreciationAmort: item.depreciationAmort?.toString() ?? null,
      ebit: item.ebit?.toString() ?? null,
      ebitda: item.ebitda?.toString() ?? null,
      operatingIncome: item.operatingIncome?.toString() ?? null,
      interestExpense: item.interestExpense?.toString() ?? null,
      interestIncome: item.interestIncome?.toString() ?? null,
      otherNonOperatingIncome: item.otherNonOperatingIncome?.toString() ?? null,
      pretaxIncome: item.pretaxIncome?.toString() ?? null,
      incomeTaxExpense: item.incomeTaxExpense?.toString() ?? null,
      effectiveTaxRate: item.effectiveTaxRate?.toString() ?? null,
      netIncome: item.netIncome.toString(),
      netIncomeAttributable: item.netIncomeAttributable?.toString() ?? null,
      minorityInterest: item.minorityInterest?.toString() ?? null,
      eps: item.eps?.toString() ?? null,
      epsDiluted: item.epsDiluted?.toString() ?? null,
      sharesWeightedAvg: item.sharesWeightedAvg?.toString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      company: item.company,
    };
  }
}
