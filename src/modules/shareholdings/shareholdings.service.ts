import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ManagementRole, ShareholderType, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ShareholdingsService {
  private readonly logger = new Logger(ShareholdingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAllByCompanyAdmin(companyId: string) {
    if (!companyId || !companyId.trim()) {
      throw new BadRequestException('companyId is required');
    }

    const items = await this.prisma.shareholding.findMany({
      where: {
        companyId: companyId.trim(),
      },
      orderBy: [{ date: 'desc' }, { shareholderName: 'asc' }],
      include: {
        company: {
          select: {
            id: true,
            displayName: true,
            legalName: true,
            logoUrl: true,
          },
        },
        management: {
          select: {
            id: true,
            name: true,
            position: true,
            role: true,
            isActive: true,
          },
        },
      },
    });

    return items
      .map((item) => this.mapShareholding(item))
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }

  async findOneAdmin(id: string) {
    const shareholding = await this.prisma.shareholding.findUnique({
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
        management: {
          select: {
            id: true,
            name: true,
            position: true,
            role: true,
            isActive: true,
          },
        },
      },
    });

    if (!shareholding) {
      throw new NotFoundException(`Shareholding ${id} not found`);
    }

    const mapped = this.mapShareholding(shareholding);

    if (!mapped) {
      throw new InternalServerErrorException(
        `Shareholding ${id} has invalid date data`,
      );
    }

    return mapped;
  }

  async createAdmin(body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Request body must be a single object');
    }

    const data = await this.buildCreateData(body as Record<string, unknown>);
    const shareholding = await this.prisma.shareholding.create({
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
        management: {
          select: {
            id: true,
            name: true,
            position: true,
            role: true,
            isActive: true,
          },
        },
      },
    });

    return this.mapShareholding(shareholding);
  }

  async updateAdmin(id: string, body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Request body must be a single object');
    }

    const current = await this.getExistingShareholding(id);
    const data = await this.buildUpdateData(id, current, body as Record<string, unknown>);
    const shareholding = await this.prisma.shareholding.update({
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
        management: {
          select: {
            id: true,
            name: true,
            position: true,
            role: true,
            isActive: true,
          },
        },
      },
    });

    return this.mapShareholding(shareholding);
  }

  async deleteAdmin(id: string) {
    await this.ensureShareholdingExists(id);

    return this.prisma.shareholding.delete({
      where: { id },
    });
  }

  private async buildCreateData(
    body: Record<string, unknown>,
  ): Promise<Prisma.ShareholdingUncheckedCreateInput> {
    const requiredFields = [
      'companyId',
      'date',
      'shareholderName',
      'shareholderType',
      'sharesHeld',
      'percentageOwned',
      'currency',
    ] as const;

    for (const field of requiredFields) {
      if (body[field] === undefined || body[field] === null || body[field] === '') {
        throw new BadRequestException(`Field ${field} is required`);
      }
    }

    return (await this.buildShareholdingData(body, true)) as Prisma.ShareholdingUncheckedCreateInput;
  }

  private async buildUpdateData(
    id: string,
    current: {
      companyId: string;
      shareholderName: string;
      date: Date;
    },
    body: Record<string, unknown>,
  ): Promise<Prisma.ShareholdingUncheckedUpdateInput> {
    return (await this.buildShareholdingData(
      body,
      false,
      current,
      id,
    )) as Prisma.ShareholdingUncheckedUpdateInput;
  }

  private async buildShareholdingData(
    body: Record<string, unknown>,
    isCreate: boolean,
    current?: {
      companyId: string;
      shareholderName: string;
      date: Date;
    },
    id?: string,
  ): Promise<Record<string, unknown>> {
    const data: Record<string, unknown> = {};

    this.setString(data, body, 'companyId', isCreate);
    this.setDate(data, body, 'date', isCreate);
    this.setString(data, body, 'shareholderName', isCreate);
    this.setEnum(data, body, 'shareholderType', isCreate);
    this.setOptionalString(data, body, 'managementId');
    this.setBigInt(data, body, 'sharesHeld', isCreate);
    this.setDecimal(data, body, 'percentageOwned', isCreate);
    this.setString(data, body, 'currency', isCreate);

    const companyId = (typeof data.companyId === 'string' ? data.companyId : undefined) ?? current?.companyId;
    const shareholderName =
      typeof data.shareholderName === 'string' ? data.shareholderName : current?.shareholderName;
    const date = data.date instanceof Date ? data.date : current?.date;

    if (typeof companyId === 'string') {
      await this.ensureCompanyExists(companyId);
    }

    if (typeof data.managementId === 'string') {
      if (!companyId || !String(companyId).trim()) {
        throw new BadRequestException('companyId is required when managementId is provided');
      }

      await this.ensureManagementExists(data.managementId, String(companyId));
    }

    if (isCreate && typeof companyId === 'string' && shareholderName && date) {
      await this.ensureShareholdingUnique({
        companyId,
        shareholderName,
        date,
      });
    }

    if (!isCreate && id && companyId && shareholderName && date) {
      await this.ensureShareholdingUniqueOnUpdate({
        id,
        companyId,
        shareholderName,
        date,
      });
    }

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

  private setOptionalString(
    target: Record<string, unknown>,
    body: Record<string, unknown>,
    key: string,
  ) {
    const value = body[key];
    if (value === undefined || value === null || value === '') {
      return;
    }

    target[key] = String(value);
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

    const normalized = String(value).trim().toUpperCase();
    const allowed: ShareholderType[] = [
      'PROMOTER',
      'INSTITUTIONAL',
      'INSIDER',
      'GOVERNMENT',
      'FOREIGN',
      'PUBLIC',
    ];

    if (!allowed.includes(normalized as ShareholderType)) {
      throw new BadRequestException(
        `Field ${key} must be one of: ${allowed.join(', ')}`,
      );
    }

    target[key] = normalized as ShareholderType;
  }

  private setBigInt(
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

    try {
      target[key] = BigInt(String(value));
    } catch {
      throw new BadRequestException(`Field ${key} must be a valid integer`);
    }
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

  private async ensureCompanyExists(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId.trim() },
      select: { id: true },
    });

    if (!company) {
      throw new NotFoundException(`Company ${companyId} not found`);
    }
  }

  private async ensureManagementExists(id: string, companyId: string) {
    const management = await this.prisma.management.findFirst({
      where: {
        id: id.trim(),
        companyId: companyId.trim(),
      },
      select: { id: true },
    });

    if (!management) {
      throw new NotFoundException(
        `Management ${id} not found for company ${companyId}`,
      );
    }
  }

  private async ensureShareholdingExists(id: string) {
    const shareholding = await this.prisma.shareholding.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!shareholding) {
      throw new NotFoundException(`Shareholding ${id} not found`);
    }
  }

  private async getExistingShareholding(id: string) {
    const shareholding = await this.prisma.shareholding.findUnique({
      where: { id },
      select: {
        companyId: true,
        shareholderName: true,
        date: true,
      },
    });

    if (!shareholding) {
      throw new NotFoundException(`Shareholding ${id} not found`);
    }

    return shareholding;
  }

  private async ensureShareholdingUnique(input: {
    companyId: string;
    shareholderName: string;
    date: Date;
  }) {
    const existing = await this.prisma.shareholding.findFirst({
      where: {
        companyId: input.companyId,
        shareholderName: input.shareholderName,
        date: input.date,
      },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException(
        `Shareholding for "${input.shareholderName}" on ${input.date.toISOString()} already exists`,
      );
    }
  }

  private async ensureShareholdingUniqueOnUpdate(input: {
    id: string;
    companyId: string;
    shareholderName?: string;
    date?: Date;
  }) {
    if (!input.shareholderName && !input.date) {
      return;
    }

    const current = await this.prisma.shareholding.findUnique({
      where: { id: input.id },
      select: {
        companyId: true,
        shareholderName: true,
        date: true,
      },
    });

    if (!current) {
      throw new NotFoundException(`Shareholding ${input.id} not found`);
    }

    const existing = await this.prisma.shareholding.findFirst({
      where: {
        companyId: input.companyId ?? current.companyId,
        shareholderName: input.shareholderName ?? current.shareholderName,
        date: input.date ?? current.date,
        id: {
          not: input.id,
        },
      },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException(
        `Shareholding for "${input.shareholderName ?? current.shareholderName}" already exists on the selected date`,
      );
    }
  }

  private mapShareholding(item: {
    id: string;
    companyId: string;
    date: Date;
    shareholderName: string;
    shareholderType: ShareholderType;
    managementId: string | null;
    sharesHeld: bigint;
    percentageOwned: Prisma.Decimal;
    currency: string;
    createdAt: Date;
    updatedAt: Date;
    company: {
      id: string;
      displayName: string;
      legalName: string;
      logoUrl: string | null;
    };
    management: {
      id: string;
      name: string;
      position: string;
      role: ManagementRole;
      isActive: boolean;
    } | null;
  }) {
    const date = this.safeDateToISOString(item.date, 'date', item.id);
    const createdAt = this.safeDateToISOString(
      item.createdAt,
      'createdAt',
      item.id,
    );
    const updatedAt = this.safeDateToISOString(
      item.updatedAt,
      'updatedAt',
      item.id,
    );

    if (!date || !createdAt || !updatedAt) {
      return null;
    }

    return {
      id: item.id,
      companyId: item.companyId,
      date,
      shareholderName: item.shareholderName,
      shareholderType: item.shareholderType,
      managementId: item.managementId,
      sharesHeld: item.sharesHeld.toString(),
      percentageOwned: item.percentageOwned.toString(),
      currency: item.currency,
      createdAt,
      updatedAt,
      company: item.company,
      management: item.management,
    };
  }

  private safeDateToISOString(
    value: Date,
    field: string,
    itemId: string,
  ): string | null {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      this.logger.warn(
        `Shareholding ${itemId} has invalid ${field}; skipping response mapping`,
      );
      return null;
    }

    return value.toISOString();
  }
}
