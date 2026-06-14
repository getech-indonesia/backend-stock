import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditStatus, PeriodType, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AdminBalanceSheetsQueryDto } from './dto/admin-balance-sheets-query.dto';

@Injectable()
export class BalanceSheetsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllAdmin(query: AdminBalanceSheetsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const keyword = query.keyword?.trim() ?? query.q?.trim();

    const filters: Prisma.BalanceSheetWhereInput[] = [];

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
      this.prisma.balanceSheet.findMany({
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
      this.prisma.balanceSheet.count({ where }),
    ]);

    return {
      items: items.map((item) => this.mapBalanceSheet(item)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }

  async findAllByCompanyAdmin(
    companyId: string,
    query: AdminBalanceSheetsQueryDto,
  ) {
    if (!companyId || !companyId.trim()) {
      throw new BadRequestException('companyId is required');
    }

    const keyword = query.keyword?.trim() ?? query.q?.trim();

    const filters: Prisma.BalanceSheetWhereInput[] = [
      {
        companyId: companyId.trim(),
      },
    ];

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

    const where = {
      AND: filters,
    };

    const items = await this.prisma.balanceSheet.findMany({
      where,
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
    });

    return items.map((item) => this.mapBalanceSheet(item));
  }

  async findOneAdmin(id: string) {
    const balanceSheet = await this.prisma.balanceSheet.findUnique({
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

    if (!balanceSheet) {
      throw new NotFoundException(`Balance sheet ${id} not found`);
    }

    return this.mapBalanceSheet(balanceSheet);
  }

  async createAdmin(body: unknown) {
    const payloads = this.normalizeCreatePayloads(body);
    const created = await Promise.all(
      payloads.map(async (payload) => {
        const data = this.buildCreateData(payload);
        const balanceSheet = await this.upsertBalanceSheet({
          data,
        });

        return this.mapBalanceSheet(balanceSheet);
      }),
    );

    return payloads.length === 1 ? created[0] : created;
  }

  async upsertAdmin(body: unknown) {
    const payloads = this.normalizeCreatePayloads(body);

    const upserted = await Promise.all(
      payloads.map(async (payload) => {
        const normalizedPayload = this.normalizeUpsertPayload(payload);
        const balanceSheet = await this.upsertBalanceSheetByCompanyPeriodYear(
          normalizedPayload,
        );

        return this.mapBalanceSheet(balanceSheet);
      }),
    );

    return payloads.length === 1 ? upserted[0] : upserted;
  }

  async updateAdmin(id: string, body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Request body must be a single object');
    }

    const data = this.buildUpdateData(body as Record<string, unknown>);
    const balanceSheet = await this.updateBalanceSheetById(id, data);
    return this.mapBalanceSheet(balanceSheet);
  }

  async batchUpdateAdmin(body: unknown) {
    const payloads = this.normalizeBatchPayloads(body);

    const updated = await Promise.all(
      payloads.map(async (payload) => {
        const targetId = await this.resolveBalanceSheetId(payload);
        const data = this.buildUpdateData(payload);
        const balanceSheet = await this.updateBalanceSheetById(targetId, data);
        return this.mapBalanceSheet(balanceSheet);
      }),
    );

    return updated;
  }

  private async updateBalanceSheetById(
    id: string,
    data: Prisma.BalanceSheetUncheckedUpdateInput,
  ) {
    await this.ensureBalanceSheetExists(id);

    return this.prisma.balanceSheet.update({
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

  private async upsertBalanceSheet(input: {
    data: Prisma.BalanceSheetUncheckedCreateInput;
  }) {
    const existing = await this.prisma.balanceSheet.findFirst({
      where: {
        companyId: input.data.companyId,
        period: input.data.period,
        fiscalYear: input.data.fiscalYear,
        fiscalQuarter: input.data.fiscalQuarter ?? null,
      },
      select: { id: true },
    });

    if (existing) {
      return this.prisma.balanceSheet.update({
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

    return this.prisma.balanceSheet.create({
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

  private async upsertBalanceSheetByCompanyPeriodYear(body: Record<string, unknown>) {
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

    const existing = await this.prisma.balanceSheet.findFirst({
      where: {
        companyId: companyId.trim(),
        period: period as PeriodType,
        fiscalYear: Number(fiscalYear),
      },
      select: { id: true },
    });

    if (existing) {
      const data = this.buildUpdateData(body);
      return this.prisma.balanceSheet.update({
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
    return this.prisma.balanceSheet.create({
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

  private ensureBalanceSheetExists(id: string) {
    return this.prisma.balanceSheet
      .findUnique({
        where: { id },
        select: { id: true },
      })
      .then((exists) => {
        if (!exists) {
          throw new NotFoundException(`Balance sheet ${id} not found`);
        }
      });
  }

  private buildCreateData(
    body: Record<string, unknown>,
  ): Prisma.BalanceSheetUncheckedCreateInput {
    const requiredFields = [
      'companyId',
      'period',
      'fiscalYear',
      'periodEndDate',
      'currency',
      'totalAssets',
      'totalEquity',
    ] as const;

    for (const field of requiredFields) {
      if (body[field] === undefined || body[field] === null || body[field] === '') {
        throw new BadRequestException(`Field ${field} is required`);
      }
    }

    return this.buildBalanceSheetData(body, true) as Prisma.BalanceSheetUncheckedCreateInput;
  }

  private buildUpdateData(
    body: Record<string, unknown>,
  ): Prisma.BalanceSheetUncheckedUpdateInput {
    return this.buildBalanceSheetData(body, false) as Prisma.BalanceSheetUncheckedUpdateInput;
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

  private async resolveBalanceSheetId(body: Record<string, unknown>) {
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

    const existing = await this.prisma.balanceSheet.findFirst({
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
        `Balance sheet not found for companyId=${companyId}, period=${period}, fiscalYear=${fiscalYear}, fiscalQuarter=${fiscalQuarter ?? 'null'}`,
      );
    }

    return existing.id;
  }

  private buildBalanceSheetData(
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

    this.setDecimal(data, body, 'cash');
    this.setDecimal(data, body, 'shortTermInvestments');
    this.setDecimal(data, body, 'accountsReceivable');
    this.setDecimal(data, body, 'inventory');
    this.setDecimal(data, body, 'otherCurrentAssets');
    this.setDecimal(data, body, 'totalCurrentAssets');
    this.setDecimal(data, body, 'propertyPlantEquipment');
    this.setDecimal(data, body, 'intangibleAssets');
    this.setDecimal(data, body, 'goodwill');
    this.setDecimal(data, body, 'longTermInvestments');
    this.setDecimal(data, body, 'otherNonCurrentAssets');
    this.setDecimal(data, body, 'totalNonCurrentAssets');
    this.setDecimal(data, body, 'totalAssets', isCreate);
    this.setDecimal(data, body, 'shortTermDebt');
    this.setDecimal(data, body, 'accountsPayable');
    this.setDecimal(data, body, 'deferredRevenue');
    this.setDecimal(data, body, 'otherCurrentLiabilities');
    this.setDecimal(data, body, 'totalCurrentLiabilities');
    this.setDecimal(data, body, 'longTermDebt');
    this.setDecimal(data, body, 'deferredTaxLiabilities');
    this.setDecimal(data, body, 'otherNonCurrentLiabilities');
    this.setDecimal(data, body, 'totalNonCurrentLiabilities');
    this.setDecimal(data, body, 'totalLiabilities');
    this.setDecimal(data, body, 'commonStock');
    this.setDecimal(data, body, 'additionalPaidInCapital');
    this.setDecimal(data, body, 'retainedEarnings');
    this.setDecimal(data, body, 'treasuryStock');
    this.setDecimal(data, body, 'otherEquity');
    this.setDecimal(data, body, 'minorityInterestEquity');
    this.setDecimal(data, body, 'totalEquity', isCreate);
    this.setDecimal(data, body, 'bookValuePerShare');
    this.setDecimal(data, body, 'netDebt');
    this.setDecimal(data, body, 'workingCapital');

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

  private mapBalanceSheet(item: {
    id: string;
    companyId: string;
    period: PeriodType;
    fiscalYear: number;
    fiscalQuarter: number | null;
    periodEndDate: Date | null;
    currency: string;
    auditStatus: AuditStatus;
    cash: Prisma.Decimal | null;
    shortTermInvestments: Prisma.Decimal | null;
    accountsReceivable: Prisma.Decimal | null;
    inventory: Prisma.Decimal | null;
    otherCurrentAssets: Prisma.Decimal | null;
    totalCurrentAssets: Prisma.Decimal | null;
    propertyPlantEquipment: Prisma.Decimal | null;
    intangibleAssets: Prisma.Decimal | null;
    goodwill: Prisma.Decimal | null;
    longTermInvestments: Prisma.Decimal | null;
    otherNonCurrentAssets: Prisma.Decimal | null;
    totalNonCurrentAssets: Prisma.Decimal | null;
    totalAssets: Prisma.Decimal;
    shortTermDebt: Prisma.Decimal | null;
    accountsPayable: Prisma.Decimal | null;
    deferredRevenue: Prisma.Decimal | null;
    otherCurrentLiabilities: Prisma.Decimal | null;
    totalCurrentLiabilities: Prisma.Decimal | null;
    longTermDebt: Prisma.Decimal | null;
    deferredTaxLiabilities: Prisma.Decimal | null;
    otherNonCurrentLiabilities: Prisma.Decimal | null;
    totalNonCurrentLiabilities: Prisma.Decimal | null;
    totalLiabilities: Prisma.Decimal | null;
    commonStock: Prisma.Decimal | null;
    additionalPaidInCapital: Prisma.Decimal | null;
    retainedEarnings: Prisma.Decimal | null;
    treasuryStock: Prisma.Decimal | null;
    otherEquity: Prisma.Decimal | null;
    minorityInterestEquity: Prisma.Decimal | null;
    totalEquity: Prisma.Decimal;
    bookValuePerShare: Prisma.Decimal | null;
    netDebt: Prisma.Decimal | null;
    workingCapital: Prisma.Decimal | null;
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
      cash: item.cash?.toString() ?? null,
      shortTermInvestments: item.shortTermInvestments?.toString() ?? null,
      accountsReceivable: item.accountsReceivable?.toString() ?? null,
      inventory: item.inventory?.toString() ?? null,
      otherCurrentAssets: item.otherCurrentAssets?.toString() ?? null,
      totalCurrentAssets: item.totalCurrentAssets?.toString() ?? null,
      propertyPlantEquipment: item.propertyPlantEquipment?.toString() ?? null,
      intangibleAssets: item.intangibleAssets?.toString() ?? null,
      goodwill: item.goodwill?.toString() ?? null,
      longTermInvestments: item.longTermInvestments?.toString() ?? null,
      otherNonCurrentAssets: item.otherNonCurrentAssets?.toString() ?? null,
      totalNonCurrentAssets: item.totalNonCurrentAssets?.toString() ?? null,
      totalAssets: item.totalAssets.toString(),
      shortTermDebt: item.shortTermDebt?.toString() ?? null,
      accountsPayable: item.accountsPayable?.toString() ?? null,
      deferredRevenue: item.deferredRevenue?.toString() ?? null,
      otherCurrentLiabilities: item.otherCurrentLiabilities?.toString() ?? null,
      totalCurrentLiabilities: item.totalCurrentLiabilities?.toString() ?? null,
      longTermDebt: item.longTermDebt?.toString() ?? null,
      deferredTaxLiabilities: item.deferredTaxLiabilities?.toString() ?? null,
      otherNonCurrentLiabilities: item.otherNonCurrentLiabilities?.toString() ?? null,
      totalNonCurrentLiabilities: item.totalNonCurrentLiabilities?.toString() ?? null,
      totalLiabilities: item.totalLiabilities?.toString() ?? null,
      commonStock: item.commonStock?.toString() ?? null,
      additionalPaidInCapital: item.additionalPaidInCapital?.toString() ?? null,
      retainedEarnings: item.retainedEarnings?.toString() ?? null,
      treasuryStock: item.treasuryStock?.toString() ?? null,
      otherEquity: item.otherEquity?.toString() ?? null,
      minorityInterestEquity: item.minorityInterestEquity?.toString() ?? null,
      totalEquity: item.totalEquity.toString(),
      bookValuePerShare: item.bookValuePerShare?.toString() ?? null,
      netDebt: item.netDebt?.toString() ?? null,
      workingCapital: item.workingCapital?.toString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      company: item.company,
    };
  }
}
