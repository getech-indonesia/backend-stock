import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditStatus, PeriodType, Prisma } from '@prisma/client';
import axios from 'axios';

import { PrismaService } from '../../prisma/prisma.service';
import { AdminIncomeStatementsQueryDto } from './dto/admin-income-statements-query.dto';

@Injectable()
export class IncomeStatementsService {
  private readonly pythonBackendBaseUrl =
    process.env.PYTHON_BACKEND_BASE_URL ?? 'http://127.0.0.1:5000/api';

  constructor(private readonly prisma: PrismaService) { }

  private buildPythonBackendUrl(path: string): string {
    return new URL(path, `${this.pythonBackendBaseUrl.replace(/\/+$/, '')}/`).toString();
  }

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

  async findAllByCompanyAdmin(
    companyId: string,
    query: AdminIncomeStatementsQueryDto,
  ) {
    if (!companyId || !companyId.trim()) {
      throw new BadRequestException('companyId is required');
    }

    const keyword = query.keyword?.trim() ?? query.q?.trim();

    const filters: Prisma.IncomeStatementWhereInput[] = [
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

    const items = await this.prisma.incomeStatement.findMany({
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

    return items.map((item) => this.mapIncomeStatement(item));
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

  async createAdmin(body: unknown) {
    const payloads = this.normalizeCreatePayloads(body);
    const created = await Promise.all(
      payloads.map(async (payload) => {
        const data = this.buildCreateData(payload);
        const incomeStatement = await this.upsertIncomeStatement({
          data,
        });

        return this.mapIncomeStatement(incomeStatement);
      }),
    );

    return payloads.length === 1 ? created[0] : created;
  }

  async upsertAdmin(body: unknown) {
    const payloads = this.normalizeCreatePayloads(body);

    const upserted = await Promise.all(
      payloads.map(async (payload) => {
        const normalizedPayload = this.normalizeUpsertPayload(payload);
        const incomeStatement = await this.upsertIncomeStatementByCompanyPeriodYear(
          normalizedPayload,
        );

        return this.mapIncomeStatement(incomeStatement);
      }),
    );

    return payloads.length === 1 ? upserted[0] : upserted;
  }

  async updateAdmin(id: string, body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Request body must be a single object');
    }

    const data = this.buildUpdateData(body as Record<string, unknown>);
    const incomeStatement = await this.updateIncomeStatementById(id, data);
    return this.mapIncomeStatement(incomeStatement);
  }

  async batchUpdateAdmin(body: unknown) {
    const payloads = this.normalizeBatchPayloads(body);

    const updated = await Promise.all(
      payloads.map(async (payload) => {
        const targetId = await this.resolveIncomeStatementId(payload);
        const data = this.buildUpdateData(payload);
        const incomeStatement = await this.updateIncomeStatementById(
          targetId,
          data,
        );
        return this.mapIncomeStatement(incomeStatement);
      }),
    );

    return updated;
  }

  private async updateIncomeStatementById(
    id: string,
    data: Prisma.IncomeStatementUncheckedUpdateInput,
  ) {
    await this.ensureIncomeStatementExists(id);

    return this.prisma.incomeStatement.update({
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

  private async upsertIncomeStatement(input: {
    data: Prisma.IncomeStatementUncheckedCreateInput;
  }) {
    const existing = await this.prisma.incomeStatement.findFirst({
      where: {
        companyId: input.data.companyId,
        period: input.data.period,
        fiscalYear: input.data.fiscalYear,
        fiscalQuarter: input.data.fiscalQuarter ?? null,
      },
      select: { id: true },
    });

    if (existing) {
      return this.prisma.incomeStatement.update({
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

    return this.prisma.incomeStatement.create({
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

  private async upsertIncomeStatementByCompanyPeriodYear(body: Record<string, unknown>) {
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

    const existing = await this.prisma.incomeStatement.findFirst({
      where: {
        companyId: companyId.trim(),
        period: period as PeriodType,
        fiscalYear: Number(fiscalYear),
      },
      select: { id: true },
    });

    if (existing) {
      const data = this.buildUpdateData(body);
      return this.prisma.incomeStatement.update({
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
    return this.prisma.incomeStatement.create({
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

  private ensureIncomeStatementExists(id: string) {
    return this.prisma.incomeStatement.findUnique({
      where: { id },
      select: { id: true },
    }).then((exists) => {
      if (!exists) {
        throw new NotFoundException(`Income statement ${id} not found`);
      }
    });
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

  private async resolveIncomeStatementId(body: Record<string, unknown>) {
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

    const existing = await this.prisma.incomeStatement.findFirst({
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
        `Income statement not found for companyId=${companyId}, period=${period}, fiscalYear=${fiscalYear}, fiscalQuarter=${fiscalQuarter ?? 'null'}`,
      );
    }

    return existing.id;
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
    periodEndDate: Date | null;
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
      periodEndDate: item.periodEndDate?.toISOString() ?? null,
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

  async syncFromPythonBackend(body: { listingId?: string; sectorId?: string }) {
    const { listingId, sectorId } = body;


    if (!listingId && !sectorId) {
      throw new BadRequestException('Either listingId or sectorId must be provided');
    }

    let listings: { id: string; symbol: string; companyId: string }[] = [];

    if (listingId) {
      // Get single listing
      const listing = await this.prisma.listing.findUnique({
        where: {
          id: listingId.trim(),
        },
        select: {
          id: true,
          symbol: true,
          companyId: true,
        },
      });

      if (!listing) {
        throw new BadRequestException(`No listing found for listingId=${listingId}`);
      }

      listings = [listing];
    } else if (sectorId) {
      // Get all listings in the sector
      listings = await this.prisma.listing.findMany({
        where: {
          company: {
            industry: {
              sectorId: sectorId.trim(),
            },
          },
        },
        select: {
          id: true,
          symbol: true,
          companyId: true,
        },
      });

      if (listings.length === 0) {
        throw new BadRequestException(`No listings found for sectorId=${sectorId}`);
      }
    }

    const results: { symbol: string; success: boolean; error?: string }[] = [];

    for (const listing of listings) {
      try {
        // Call Python backend with a very long timeout (30 minutes)
        const endpoint = this.buildPythonBackendUrl('income-statement');

        console.log('[SYNC] Starting sync for', listing.symbol);
        console.log('[SYNC] Calling Python backend at', endpoint);

        const startTime = Date.now();
        const response = await axios.get(endpoint, {
          params: {
            symbol: listing.symbol,
          },
          timeout: 30 * 60 * 1000, // 30 minutes in milliseconds
        });
        console.log('[SYNC] Python responded in', (Date.now() - startTime) / 1000, 'seconds');
        console.log('[SYNC] Response status:', response.data.status);

        if (response.data.status !== 'ok') {
          results.push({
            symbol: listing.symbol,
            success: false,
            error: `Python backend returned status: ${response.data.status}`,
          });
          continue;
        }

        // Process each income statement item
        const incomeStatements = response.data.data || [];

        for (const statement of incomeStatements) {
          const data: Prisma.IncomeStatementUncheckedCreateInput = {
            companyId: listing.companyId,
            period: statement.period as PeriodType,
            fiscalYear: statement.fiscalYear,
            fiscalQuarter: statement.fiscalQuarter ?? null,
            periodEndDate: statement.periodEndDate ? new Date(statement.periodEndDate) : null,
            currency: statement.currency,
            auditStatus: statement.auditStatus as AuditStatus,
            revenue: new Prisma.Decimal(statement.revenue),
            revenueGrowthYoY: statement.revenueGrowthYoY ? new Prisma.Decimal(statement.revenueGrowthYoY) : null,
            cogs: statement.cogs ? new Prisma.Decimal(Math.abs(statement.cogs)) : null,
            grossProfit: statement.grossProfit ? new Prisma.Decimal(statement.grossProfit) : null,
            operatingExpenses: statement.operatingExpenses ? new Prisma.Decimal(Math.abs(statement.operatingExpenses)) : null,
            sellingExpenses: statement.sellingExpenses ? new Prisma.Decimal(Math.abs(statement.sellingExpenses)) : null,
            generalAdminExpenses: statement.generalAdminExpenses ? new Prisma.Decimal(Math.abs(statement.generalAdminExpenses)) : null,
            rdExpenses: statement.rdExpenses ? new Prisma.Decimal(Math.abs(statement.rdExpenses)) : null,
            depreciationAmort: statement.depreciationAmort ? new Prisma.Decimal(statement.depreciationAmort) : null,
            ebit: statement.ebit ? new Prisma.Decimal(statement.ebit) : null,
            ebitda: statement.ebitda ? new Prisma.Decimal(statement.ebitda) : null,
            operatingIncome: statement.operatingIncome ? new Prisma.Decimal(statement.operatingIncome) : null,
            interestExpense: statement.interestExpense ? new Prisma.Decimal(Math.abs(statement.interestExpense)) : null,
            interestIncome: statement.interestIncome ? new Prisma.Decimal(statement.interestIncome) : null,
            otherNonOperatingIncome: statement.otherNonOperatingIncome ? new Prisma.Decimal(statement.otherNonOperatingIncome) : null,
            pretaxIncome: statement.pretaxIncome ? new Prisma.Decimal(statement.pretaxIncome) : null,
            incomeTaxExpense: statement.incomeTaxExpense ? new Prisma.Decimal(Math.abs(statement.incomeTaxExpense)) : null,
            effectiveTaxRate: statement.effectiveTaxRate ? new Prisma.Decimal(statement.effectiveTaxRate) : null,
            netIncome: new Prisma.Decimal(statement.netIncome),
            netIncomeAttributable: statement.netIncomeAttributable ? new Prisma.Decimal(statement.netIncomeAttributable) : null,
            minorityInterest: statement.minorityInterest ? new Prisma.Decimal(statement.minorityInterest) : null,
            eps: statement.eps ? new Prisma.Decimal(statement.eps) : null,
            epsDiluted: statement.epsDiluted ? new Prisma.Decimal(statement.epsDiluted) : null,
            sharesWeightedAvg: statement.sharesWeightedAvg ? BigInt(statement.sharesWeightedAvg) : null,
          };

          // Upsert the income statement
          await this.upsertIncomeStatement({ data });
        }

        results.push({
          symbol: listing.symbol,
          success: true,
        });
      } catch (error: any) {
        results.push({
          symbol: listing.symbol,
          success: false,
          error: error.message || 'Unknown error',
        });
      }
    }

    return results;
  }
}
