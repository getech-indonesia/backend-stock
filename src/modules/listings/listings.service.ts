import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AssetType, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AdminListingsQueryDto } from './dto/admin-listings-query.dto';
import { ListingScoreCalculator } from './services/listing-score.calculator';

@Injectable()
export class ListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoreCalculator: ListingScoreCalculator,
  ) {}

  async findAllAdmin(query: AdminListingsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const keyword = query.keyword?.trim() ?? query.q?.trim();

    const filters: Prisma.ListingWhereInput[] = [];

    if (keyword) {
      filters.push({
        OR: [
          {
            symbol: {
              contains: keyword,
              mode: 'insensitive',
            },
          },
          {
            isin: {
              contains: keyword,
              mode: 'insensitive',
            },
          },
          {
            cusip: {
              contains: keyword,
              mode: 'insensitive',
            },
          },
          {
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
          },
          {
            exchange: {
              OR: [
                {
                  code: {
                    contains: keyword,
                    mode: 'insensitive',
                  },
                },
                {
                  name: {
                    contains: keyword,
                    mode: 'insensitive',
                  },
                },
              ],
            },
          },
        ],
      });
    }

    if (query.companyId) {
      filters.push({
        companyId: query.companyId,
      });
    }

    if (query.exchangeId) {
      filters.push({
        exchangeId: query.exchangeId,
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

    if (query.assetType) {
      filters.push({
        assetType: query.assetType,
      });
    }

    const where =
      filters.length > 0
        ? {
            AND: filters,
          }
        : undefined;

    const [items, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ symbol: 'asc' }, { createdAt: 'desc' }],
        include: {
          company: {
            select: {
              id: true,
              displayName: true,
              legalName: true,
              logoUrl: true,
              industry: {
                select: {
                  id: true,
                  name: true,
                  sector: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
          exchange: {
            select: {
              id: true,
              code: true,
              name: true,
              exchangeType: true,
            },
          },
        },
      }),
      this.prisma.listing.count({ where }),
    ]);

    return {
      items: items.map((item) => this.mapListing(item)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }

  async findOneAdmin(id: string) {
    const listing = await this.prisma.listing.findUnique({
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
        exchange: {
          select: {
            id: true,
            code: true,
            name: true,
            exchangeType: true,
          },
        },
      },
    });

    if (!listing) {
      throw new NotFoundException(`Listing ${id} not found`);
    }

    return this.mapListing(listing);
  }

  async createAdmin(body: unknown) {
    const payloads = this.normalizePayloads(body);
    const created = await Promise.all(
      payloads.map(async (payload) => {
        const data = this.buildCreateData(payload);
        const listing = await this.upsertListingBySymbolExchange({
          data,
        });

        return this.mapListing(listing);
      }),
    );

    return payloads.length === 1 ? created[0] : created;
  }

  async updateAdmin(id: string, body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Request body must be a single object');
    }

    const data = this.buildUpdateData(body as Record<string, unknown>);
    const listing = await this.updateListingById(id, data);
    return this.mapListing(listing);
  }

  async deleteAdmin(id: string) {
    await this.ensureListingExists(id);

    return this.prisma.listing.delete({
      where: { id },
    });
  }

  async getListingScores(query: any) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const keyword = query.keyword?.trim();

    const filters: Prisma.ListingWhereInput[] = [];

    if (keyword) {
      filters.push({
        OR: [
          {
            symbol: {
              contains: keyword,
              mode: 'insensitive',
            },
          },
          {
            company: {
              displayName: {
                contains: keyword,
                mode: 'insensitive',
              },
            },
          },
        ],
      });
    }

    if (query.exchangeId) {
      filters.push({
        exchangeId: query.exchangeId,
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
      this.prisma.listing.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { symbol: 'asc' },
        select: {
          id: true,
          symbol: true,
          companyId: true,
          company: {
            select: {
              id: true,
              displayName: true,
              logoUrl: true,
              industry: {
                select: {
                  id: true,
                  name: true,
                  sector: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.listing.count({ where }),
    ]);

    // Calculate scores for each listing
    const itemsWithScores = await Promise.all(
      items.map(async (item) => {
        const gScore = await this.scoreCalculator.calculateGScore(item.companyId);

        return {
          symbol: item.symbol,
          companyName: item.company.displayName,
          companyLogoUrl: item.company.logoUrl,
          sector: item.company.industry?.sector
            ? {
                id: item.company.industry.sector.id,
                name: item.company.industry.sector.name,
              }
            : null,
          g: gScore.score,
          r: null,
          o: null,
          v: null,
          e: null,
          score: gScore.score,
          stance: this.getStance(gScore.score),
          scoreBreakdown: {
            g: {
              score: gScore.score,
              maxScore: gScore.maxScore,
              details: gScore.details,
            },
            r: this.buildNotImplementedPillar(),
            o: this.buildNotImplementedPillar(),
            v: this.buildNotImplementedPillar(),
            e: this.buildNotImplementedPillar(),
          },
        };
      }),
    );

    return {
      items: itemsWithScores,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }

  private buildNotImplementedPillar() {
    return {
      score: null,
      maxScore: 0,
      details: null,
      status: 'not_implemented',
    };
  }
  private getStance(score: number): string {
    if (score >= 70) return 'Strong Buy';
    if (score >= 50) return 'Buy';
    if (score >= 30) return 'Hold';
    if (score >= 10) return 'Underperform';
    return 'Sell';
  }

  private async updateListingById(
    id: string,
    data: Prisma.ListingUncheckedUpdateInput,
  ) {
    await this.ensureListingExists(id);

    return this.prisma.listing.update({
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
        exchange: {
          select: {
            id: true,
            code: true,
            name: true,
            exchangeType: true,
          },
        },
      },
    });
  }

  private async upsertListingBySymbolExchange(input: {
    data: Prisma.ListingUncheckedCreateInput;
  }) {
    const existing = await this.prisma.listing.findFirst({
      where: {
        symbol: input.data.symbol,
        exchangeId: input.data.exchangeId,
      },
      select: { id: true },
    });

    if (existing) {
      return this.prisma.listing.update({
        where: { id: existing.id },
        data: input.data,
        include: {
          company: {
            select: {
              id: true,
              displayName: true,
              legalName: true,
              logoUrl: true,
              industry: {
                select: {
                  id: true,
                  name: true,
                  sector: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
          exchange: {
            select: {
              id: true,
              code: true,
              name: true,
              exchangeType: true,
            },
          },
        },
      });
    }

    return this.prisma.listing.create({
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
        exchange: {
          select: {
            id: true,
            code: true,
            name: true,
            exchangeType: true,
          },
        },
      },
    });
  }

  private ensureListingExists(id: string) {
    return this.prisma.listing
      .findUnique({
        where: { id },
        select: { id: true },
      })
      .then((exists) => {
        if (!exists) {
          throw new NotFoundException(`Listing ${id} not found`);
        }
      });
  }

  private normalizePayloads(body: unknown): Record<string, unknown>[] {
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

  private buildCreateData(body: Record<string, unknown>): Prisma.ListingUncheckedCreateInput {
    const requiredFields = ['symbol', 'assetType', 'companyId', 'exchangeId'] as const;

    for (const field of requiredFields) {
      if (body[field] === undefined || body[field] === null || body[field] === '') {
        throw new BadRequestException(`Field ${field} is required`);
      }
    }

    return this.buildListingData(body, true) as Prisma.ListingUncheckedCreateInput;
  }

  private buildUpdateData(body: Record<string, unknown>): Prisma.ListingUncheckedUpdateInput {
    return this.buildListingData(body, false) as Prisma.ListingUncheckedUpdateInput;
  }

  private buildListingData(
    body: Record<string, unknown>,
    isCreate: boolean,
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {};

    this.setString(data, body, 'symbol', isCreate);
    this.setString(data, body, 'isin');
    this.setString(data, body, 'cusip');
    this.setEnum(data, body, 'assetType', isCreate);
    this.setDate(data, body, 'ipoDate');
    this.setString(data, body, 'companyId', isCreate);
    this.setString(data, body, 'exchangeId', isCreate);

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

  private setDate(
    target: Record<string, unknown>,
    body: Record<string, unknown>,
    key: string,
  ) {
    const value = body[key];
    if (value === undefined || value === null || value === '') {
      return;
    }

    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Field ${key} must be a valid date`);
    }

    target[key] = date;
  }

  private mapListing(item: {
    id: string;
    symbol: string;
    isin: string | null;
    cusip: string | null;
    assetType: AssetType;
    ipoDate: Date | null;
    companyId: string;
    exchangeId: string;
    createdAt: Date;
    updatedAt: Date;
    company: {
      id: string;
      displayName: string;
      legalName: string;
      logoUrl: string | null;
    };
    exchange: {
      id: string;
      code: string;
      name: string;
      exchangeType: string;
    };
  }) {
    return {
      id: item.id,
      symbol: item.symbol,
      isin: item.isin,
      cusip: item.cusip,
      assetType: item.assetType,
      ipoDate: item.ipoDate?.toISOString() ?? null,
      companyId: item.companyId,
      exchangeId: item.exchangeId,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      company: item.company,
      exchange: item.exchange,
    };
  }
}



