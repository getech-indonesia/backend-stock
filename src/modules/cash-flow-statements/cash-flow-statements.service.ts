import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditStatus, PeriodType, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AdminCashFlowStatementsQueryDto } from './dto/admin-cash-flow-statements-query.dto';

@Injectable()
export class CashFlowStatementsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllAdmin(query: AdminCashFlowStatementsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const keyword = query.keyword?.trim() ?? query.q?.trim();

    const filters: Prisma.CashFlowStatementWhereInput[] = [];

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
            {
              listings: {
                some: {
                  symbol: {
                    contains: keyword,
                    mode: 'insensitive',
                  },
                },
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

    if (query.sectorId) {
      filters.push({
        company: {
          industry: {
            sectorId: query.sectorId,
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

    const [items, total] = await Promise.all([
      this.prisma.cashFlowStatement.findMany({
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
      this.prisma.cashFlowStatement.count({ where }),
    ]);

    return {
      items: items.map((item) => this.mapCashFlowStatement(item)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }

  async findOneAdmin(id: string) {
    const cashFlowStatement = await this.prisma.cashFlowStatement.findUnique({
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

    if (!cashFlowStatement) {
      throw new NotFoundException(`Cash flow statement ${id} not found`);
    }

    return this.mapCashFlowStatement(cashFlowStatement);
  }

  async createAdmin(body: unknown) {
    const payloads = this.normalizeCreatePayloads(body);
    const created = await Promise.all(
      payloads.map(async (payload) => {
        const data = this.buildCreateData(payload);
        const cashFlowStatement = await this.upsertCashFlowStatement({
          data,
        });

        return this.mapCashFlowStatement(cashFlowStatement);
      }),
    );

    return payloads.length === 1 ? created[0] : created;
  }

  async upsertAdmin(body: unknown) {
    const payloads = this.normalizeCreatePayloads(body);

    const upserted = await Promise.all(
      payloads.map(async (payload) => {
        const normalizedPayload = this.normalizeUpsertPayload(payload);
        const cashFlowStatement = await this.upsertCashFlowStatementByCompanyPeriodYear(
          normalizedPayload,
        );

        return this.mapCashFlowStatement(cashFlowStatement);
      }),
    );

    return payloads.length === 1 ? upserted[0] : upserted;
  }

  async updateAdmin(id: string, body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Request body must be a single object');
    }

    const data = this.buildUpdateData(body as Record<string, unknown>);
    const cashFlowStatement = await this.updateCashFlowStatementById(id, data);
    return this.mapCashFlowStatement(cashFlowStatement);
  }

  async batchUpdateAdmin(body: unknown) {
    const payloads = this.normalizeBatchPayloads(body);

    const updated = await Promise.all(
      payloads.map(async (payload) => {
        const targetId = await this.resolveCashFlowStatementId(payload);
        const data = this.buildUpdateData(payload);
        const cashFlowStatement = await this.updateCashFlowStatementById(targetId, data);
        return this.mapCashFlowStatement(cashFlowStatement);
      }),
    );

    return updated;
  }

  private async updateCashFlowStatementById(
    id: string,
    data: Prisma.CashFlowStatementUncheckedUpdateInput,
  ) {
    await this.ensureCashFlowStatementExists(id);

    return this.prisma.cashFlowStatement.update({
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
  }

  private async upsertCashFlowStatement(input: {
    data: Prisma.CashFlowStatementUncheckedCreateInput;
  }) {
    const existing = await this.prisma.cashFlowStatement.findFirst({
      where: {
        companyId: input.data.companyId,
        period: input.data.period,
        fiscalYear: input.data.fiscalYear,
        fiscalQuarter: input.data.fiscalQuarter ?? null,
      },
      select: { id: true },
    });

    if (existing) {
      return this.prisma.cashFlowStatement.update({
        where: { id: existing.id },
        data: input.data,
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
    }

    return this.prisma.cashFlowStatement.create({
      data: input.data,
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
  }

  private async upsertCashFlowStatementByCompanyPeriodYear(body: Record<string, unknown>) {
    const companyId = body.companyId;
    const period = body.period;
    const fiscalYear = body.fiscalYear;

    if (
      typeof companyId !== 'string' ||
      !companyId.trim() ||
      typeof period !== 'string' ||
      !period.trim() ||
      fiscalYear === undefined ||
      fiscalYear === null ||
      fiscalYear === ''
    ) {
      throw new BadRequestException(
        'Upsert items must include companyId, period, and fiscalYear',
      );
    }

    const existing = await this.prisma.cashFlowStatement.findFirst({
      where: {
        companyId: companyId.trim(),
        period: period as PeriodType,
        fiscalYear: Number(fiscalYear),
      },
      select: { id: true },
    });

    if (existing) {
      const data = this.buildUpdateData(body);
      return this.prisma.cashFlowStatement.update({
        where: { id: existing.id },
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
    }

    const data = this.buildCreateData(body);
    return this.prisma.cashFlowStatement.create({
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
  }

  private normalizeUpsertPayload(body: Record<string, unknown>) {
    const normalized = { ...body };
    const period = normalized.period;

    if (typeof period === 'string') {
      const canonicalPeriod = period.trim().toUpperCase();
      if (
        canonicalPeriod === 'ANNUAL' ||
        canonicalPeriod === 'Q1' ||
        canonicalPeriod === 'Q2' ||
        canonicalPeriod === 'Q3' ||
        canonicalPeriod === 'Q4' ||
        canonicalPeriod === 'TTM'
      ) {
        normalized.period = canonicalPeriod;
      }
    }

    return normalized;
  }

  private ensureCashFlowStatementExists(id: string) {
    return this.prisma.cashFlowStatement
      .findUnique({
        where: { id },
        select: { id: true },
      })
      .then((exists) => {
        if (!exists) {
          throw new NotFoundException(`Cash flow statement ${id} not found`);
        }
      });
  }

  private buildCreateData(
    body: Record<string, unknown>,
  ): Prisma.CashFlowStatementUncheckedCreateInput {
    const requiredFields = [
      'companyId',
      'period',
      'fiscalYear',
      'periodEndDate',
      'currency',
      'netCashFromOperations',
    ] as const;

    for (const field of requiredFields) {
      if (body[field] === undefined || body[field] === null || body[field] === '') {
        throw new BadRequestException(`Field ${field} is required`);
      }
    }

    return this.buildCashFlowStatementData(body, true) as Prisma.CashFlowStatementUncheckedCreateInput;
  }

  private buildUpdateData(
    body: Record<string, unknown>,
  ): Prisma.CashFlowStatementUncheckedUpdateInput {
    return this.buildCashFlowStatementData(body, false) as Prisma.CashFlowStatementUncheckedUpdateInput;
  }

  private normalizeCreatePayloads(body: unknown): Record<string, unknown>[] {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Request body must be an object or an array of objects');
    }

    if (Array.isArray(body)) {
      if (body.length === 0) {
        throw new BadRequestException('Request body array cannot be empty');
      }

      return body.map((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          throw new BadRequestException(`Item at index ${index} must be an object`);
        }

        return item as Record<string, unknown>;
      });
    }

    return [body as Record<string, unknown>];
  }

  private normalizeBatchPayloads(body: unknown): Record<string, unknown>[] {
    if (!Array.isArray(body)) {
      throw new BadRequestException('Request body must be an array of objects');
    }

    if (body.length === 0) {
      throw new BadRequestException('Request body array cannot be empty');
    }

    return body.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new BadRequestException(`Item at index ${index} must be an object`);
      }

      return item as Record<string, unknown>;
    });
  }

  private async resolveCashFlowStatementId(body: Record<string, unknown>) {
    const candidate = body.id;

    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }

    const companyId = body.companyId;
    const period = body.period;
    const fiscalYear = body.fiscalYear;
    const fiscalQuarter = body.fiscalQuarter ?? null;

    if (
      typeof companyId !== 'string' ||
      !companyId.trim() ||
      typeof period !== 'string' ||
      !period.trim() ||
      fiscalYear === undefined ||
      fiscalYear === null ||
      fiscalYear === ''
    ) {
      throw new BadRequestException(
        'Batch update items must include id or companyId, period, and fiscalYear',
      );
    }

    const existing = await this.prisma.cashFlowStatement.findFirst({
      where: {
        companyId: companyId.trim(),
        period: period as PeriodType,
        fiscalYear: Number(fiscalYear),
        fiscalQuarter:
          fiscalQuarter === '' || fiscalQuarter === undefined
            ? null
            : Number(fiscalQuarter),
      },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException(
        `Cash flow statement not found for companyId=${companyId}, period=${period}, fiscalYear=${fiscalYear}, fiscalQuarter=${fiscalQuarter ?? 'null'}`,
      );
    }

    return existing.id;
  }

  private buildCashFlowStatementData(
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

    this.setDecimal(data, body, 'netIncomeStart');
    this.setDecimal(data, body, 'depreciationAmort');
    this.setDecimal(data, body, 'stockBasedCompensation');
    this.setDecimal(data, body, 'changeInWorkingCapital');
    this.setDecimal(data, body, 'changeInReceivables');
    this.setDecimal(data, body, 'changeInInventory');
    this.setDecimal(data, body, 'changeInPayables');
    this.setDecimal(data, body, 'otherOperatingActivities');
    this.setDecimal(data, body, 'netCashFromOperations', isCreate);
    this.setDecimal(data, body, 'capitalExpenditures');
    this.setDecimal(data, body, 'acquisitions');
    this.setDecimal(data, body, 'purchaseOfInvestments');
    this.setDecimal(data, body, 'saleOfInvestments');
    this.setDecimal(data, body, 'otherInvestingActivities');
    this.setDecimal(data, body, 'netCashFromInvesting');
    this.setDecimal(data, body, 'debtIssuance');
    this.setDecimal(data, body, 'debtRepayment');
    this.setDecimal(data, body, 'commonStockIssuance');
    this.setDecimal(data, body, 'commonStockRepurchase');
    this.setDecimal(data, body, 'dividendsPaid');
    this.setDecimal(data, body, 'otherFinancingActivities');
    this.setDecimal(data, body, 'netCashFromFinancing');
    this.setDecimal(data, body, 'netChangeInCash');
    this.setDecimal(data, body, 'cashBeginningPeriod');
    this.setDecimal(data, body, 'cashEndPeriod');
    this.setDecimal(data, body, 'freeCashFlow');

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

  private mapCashFlowStatement(item: {
    id: string;
    companyId: string;
    period: PeriodType;
    fiscalYear: number;
    fiscalQuarter: number | null;
    periodEndDate: Date | null;
    currency: string;
    auditStatus: AuditStatus;
    netIncomeStart: Prisma.Decimal | null;
    depreciationAmort: Prisma.Decimal | null;
    stockBasedCompensation: Prisma.Decimal | null;
    changeInWorkingCapital: Prisma.Decimal | null;
    changeInReceivables: Prisma.Decimal | null;
    changeInInventory: Prisma.Decimal | null;
    changeInPayables: Prisma.Decimal | null;
    otherOperatingActivities: Prisma.Decimal | null;
    netCashFromOperations: Prisma.Decimal;
    capitalExpenditures: Prisma.Decimal | null;
    acquisitions: Prisma.Decimal | null;
    purchaseOfInvestments: Prisma.Decimal | null;
    saleOfInvestments: Prisma.Decimal | null;
    otherInvestingActivities: Prisma.Decimal | null;
    netCashFromInvesting: Prisma.Decimal | null;
    debtIssuance: Prisma.Decimal | null;
    debtRepayment: Prisma.Decimal | null;
    commonStockIssuance: Prisma.Decimal | null;
    commonStockRepurchase: Prisma.Decimal | null;
    dividendsPaid: Prisma.Decimal | null;
    otherFinancingActivities: Prisma.Decimal | null;
    netCashFromFinancing: Prisma.Decimal | null;
    netChangeInCash: Prisma.Decimal | null;
    cashBeginningPeriod: Prisma.Decimal | null;
    cashEndPeriod: Prisma.Decimal | null;
    freeCashFlow: Prisma.Decimal | null;
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
      periodEndDate: item.periodEndDate?.toISOString() ?? null,
      currency: item.currency,
      auditStatus: item.auditStatus,
      netIncomeStart: item.netIncomeStart?.toString() ?? null,
      depreciationAmort: item.depreciationAmort?.toString() ?? null,
      stockBasedCompensation: item.stockBasedCompensation?.toString() ?? null,
      changeInWorkingCapital: item.changeInWorkingCapital?.toString() ?? null,
      changeInReceivables: item.changeInReceivables?.toString() ?? null,
      changeInInventory: item.changeInInventory?.toString() ?? null,
      changeInPayables: item.changeInPayables?.toString() ?? null,
      otherOperatingActivities: item.otherOperatingActivities?.toString() ?? null,
      netCashFromOperations: item.netCashFromOperations.toString(),
      capitalExpenditures: item.capitalExpenditures?.toString() ?? null,
      acquisitions: item.acquisitions?.toString() ?? null,
      purchaseOfInvestments: item.purchaseOfInvestments?.toString() ?? null,
      saleOfInvestments: item.saleOfInvestments?.toString() ?? null,
      otherInvestingActivities: item.otherInvestingActivities?.toString() ?? null,
      netCashFromInvesting: item.netCashFromInvesting?.toString() ?? null,
      debtIssuance: item.debtIssuance?.toString() ?? null,
      debtRepayment: item.debtRepayment?.toString() ?? null,
      commonStockIssuance: item.commonStockIssuance?.toString() ?? null,
      commonStockRepurchase: item.commonStockRepurchase?.toString() ?? null,
      dividendsPaid: item.dividendsPaid?.toString() ?? null,
      otherFinancingActivities: item.otherFinancingActivities?.toString() ?? null,
      netCashFromFinancing: item.netCashFromFinancing?.toString() ?? null,
      netChangeInCash: item.netChangeInCash?.toString() ?? null,
      cashBeginningPeriod: item.cashBeginningPeriod?.toString() ?? null,
      cashEndPeriod: item.cashEndPeriod?.toString() ?? null,
      freeCashFlow: item.freeCashFlow?.toString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      company: item.company,
    };
  }
}
