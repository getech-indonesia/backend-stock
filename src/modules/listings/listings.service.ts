import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AssetType, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AdminListingsQueryDto } from './dto/admin-listings-query.dto';
import { ListingScoreQueryDto } from './dto/listing-score-query.dto';

@Injectable()
export class ListingsService {
  constructor(private readonly prisma: PrismaService) {}

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

  async getListingScores(query: ListingScoreQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const keyword = query.keyword?.trim() ?? query.q?.trim();
    const sortOrder = query.sortOrder ?? query.sort ?? 'desc';

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

    const scoreWhere: Prisma.ListingScoreWhereInput | undefined = where
      ? {
          listing: where,
        }
      : undefined;

    const [scores, total] = await Promise.all([
      this.prisma.listingScore.findMany({
        where: scoreWhere,
        skip,
        take: pageSize,
        orderBy: [{ totalScore: sortOrder }, { listing: { symbol: 'asc' } }],
        select: {
          listingId: true,
          sourceUpdatedAt: true,
          gScore: true,
          rScore: true,
          oScore: true,
          vScore: true,
          eScore: true,
          totalScore: true,
          stance: true,
          breakdown: true,
          listing: {
            select: {
              id: true,
              symbol: true,
              companyId: true,
              relativeStrengthSnapshots: {
                take: 1,
                orderBy: {
                  scoreDate: 'desc',
                },
                select: {
                  scoreDate: true,
                  modelVersion: true,
                  score: true,
                  maxScore: true,
                  rank: true,
                  totalRanked: true,
                  rsRating: true,
                  details: true,
                  rawPerformance: true,
                  roc63: true,
                  roc126: true,
                  roc189: true,
                  roc252: true,
                  close: true,
                  high52: true,
                  low52: true,
                  distanceHighPct: true,
                  distanceLowPct: true,
                  sourcePeriods: true,
                },
              },
              stockPrices: {
                take: 2,
                orderBy: {
                  date: 'desc',
                },
                select: {
                  date: true,
                  close: true,
                },
              },
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
          },
        },
      }),
      this.prisma.listingScore.count({ where: scoreWhere }),
    ]);

    const items = scores.map((score) => ({
      symbol: score.listing.symbol,
      companyName: score.listing.company.displayName,
      companyLogoUrl: score.listing.company.logoUrl,
      sector: score.listing.company.industry?.sector
        ? {
            id: score.listing.company.industry.sector.id,
            name: score.listing.company.industry.sector.name,
          }
        : null,
      g: this.toNumber(score.gScore),
      r: this.toNumber(score.rScore),
      o: this.toNumber(score.oScore),
      v: this.toNumber(score.vScore),
      e: this.toNumber(score.eScore),
      score: Math.round(this.toNumber(score.totalScore) ?? 0),
      stance: score.stance,
      scoreBreakdown: this.buildScoreBreakdown(
        score.breakdown,
        score.listing.relativeStrengthSnapshots?.[0] ?? null,
      ),
      latestPrice: this.buildLastPrice(score.listing.stockPrices),
    }));

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }

  private toNumber(value: Prisma.Decimal | number | string | null) {
    if (value === null) {
      return null;
    }

    return Number(value);
  }

  private buildScoreBreakdown(
    currentBreakdown: Prisma.JsonValue,
    latestRSnapshot: {
      scoreDate: Date;
      modelVersion: string;
      score: Prisma.Decimal | number | string;
      maxScore: Prisma.Decimal | number | string;
      rank: number | null;
      totalRanked: number;
      rsRating: Prisma.Decimal | number | string | null;
      details: Prisma.JsonValue;
      rawPerformance: Prisma.Decimal | number | string | null;
      roc63: Prisma.Decimal | number | string | null;
      roc126: Prisma.Decimal | number | string | null;
      roc189: Prisma.Decimal | number | string | null;
      roc252: Prisma.Decimal | number | string | null;
      close: Prisma.Decimal | number | string | null;
      high52: Prisma.Decimal | number | string | null;
      low52: Prisma.Decimal | number | string | null;
      distanceHighPct: Prisma.Decimal | number | string | null;
      distanceLowPct: Prisma.Decimal | number | string | null;
      sourcePeriods: Prisma.JsonValue;
    } | null,
  ) {
    const base =
      currentBreakdown && typeof currentBreakdown === 'object' && !Array.isArray(currentBreakdown)
        ? { ...(currentBreakdown as Record<string, unknown>) }
        : {};

    if (!latestRSnapshot) {
      return base;
    }

    return {
      ...base,
      r: {
        score: this.toNumber(latestRSnapshot.score),
        maxScore: this.toNumber(latestRSnapshot.maxScore),
        details: latestRSnapshot.details,
      },
    };
  }

  private buildLastPrice(
    stockPrices: Array<{
      date: Date;
      close: Prisma.Decimal;
    }>,
  ) {
    const latest = stockPrices?.[0];
    const previous = stockPrices?.[1];

    if (!latest) {
      return null;
    }

    const latestClose = latest.close;
    const previousClose = previous?.close ?? null;
    const change =
      previousClose !== null ? latestClose.sub(previousClose) : null;
    const changePct =
      previousClose !== null && !previousClose.isZero() && change !== null
        ? change.div(previousClose).mul(100)
        : null;
    const direction =
      change === null
        ? null
        : change.gt(0)
          ? 'UP'
          : change.lt(0)
            ? 'DOWN'
            : 'FLAT';

    return {
      latestDate: latest.date.toISOString(),
      latestClose: latestClose.toString(),
      previousDate: previous?.date.toISOString() ?? null,
      previousClose: previousClose?.toString() ?? null,
      change: change?.toString() ?? null,
      changePct: changePct?.toString() ?? null,
      direction,
    };
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private toPlainText(value: unknown, key: string) {
    if (typeof value === 'string') {
      return value;
    }

    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return value.toString();
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    throw new BadRequestException(
      `Field ${key} must be a string-compatible value`,
    );
  }

  private toDateValue(value: unknown, key: string) {
    if (value instanceof Date) {
      return value;
    }

    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }

    throw new BadRequestException(`Field ${key} must be a valid date`);
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
      throw new BadRequestException(
        'Request body must be an object or an array of objects',
      );
    }

    if (Array.isArray(body)) {
      if (body.length === 0) {
        throw new BadRequestException('Request body array cannot be empty');
      }

      const payloads: Record<string, unknown>[] = [];

      for (const [index, item] of body.entries()) {
        if (!this.isPlainObject(item)) {
          throw new BadRequestException(
            `Item at index ${index} must be an object`,
          );
        }

        payloads.push(item);
      }

      return payloads;
    }

    if (!this.isPlainObject(body)) {
      throw new BadRequestException(
        'Request body must be an object or an array of objects',
      );
    }

    return [body];
  }

  private buildCreateData(
    body: Record<string, unknown>,
  ): Prisma.ListingUncheckedCreateInput {
    const requiredFields = [
      'symbol',
      'assetType',
      'companyId',
      'exchangeId',
    ] as const;

    for (const field of requiredFields) {
      if (
        body[field] === undefined ||
        body[field] === null ||
        body[field] === ''
      ) {
        throw new BadRequestException(`Field ${field} is required`);
      }
    }

    return this.buildListingData(body, true);
  }

  private buildUpdateData(
    body: Record<string, unknown>,
  ): Prisma.ListingUncheckedUpdateInput {
    return this.buildListingData(body, false);
  }

  private buildListingData(
    body: Record<string, unknown>,
    isCreate: true,
  ): Prisma.ListingUncheckedCreateInput;
  private buildListingData(
    body: Record<string, unknown>,
    isCreate: false,
  ): Prisma.ListingUncheckedUpdateInput;
  private buildListingData(
    body: Record<string, unknown>,
    isCreate: boolean,
  ): Prisma.ListingUncheckedCreateInput | Prisma.ListingUncheckedUpdateInput {
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

    target[key] = this.toPlainText(value, key);
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

    target[key] = this.toPlainText(value, key);
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

    const date = this.toDateValue(value, key);
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
