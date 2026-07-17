import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AdminCorporateActionsQueryDto } from './dto/admin-corporate-actions-query.dto';
import { FindCorporateActionsQueryDto } from './dto/find-corporate-actions-query.dto';

@Injectable()
export class CorporateActionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindCorporateActionsQueryDto) {
    const where = query.symbol?.trim()
      ? {
          company: {
            listings: {
              some: {
                symbol: {
                  equals: query.symbol.trim().toUpperCase(),
                  mode: 'insensitive' as const,
                },
              },
            },
          },
        }
      : undefined;

    return this.findAllWithWhere(where, query.page ?? 1, query.pageSize ?? 20);
  }

  async findAllAdmin(query: AdminCorporateActionsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const keyword = query.keyword?.trim() ?? query.q?.trim();
    const fromDate = this.parseStartOfDay(query.fromDate);
    const toDate = this.parseEndOfDay(query.toDate);

    const filters: Prisma.CorporateActionWhereInput[] = [];

    if (keyword) {
      filters.push({
        OR: [
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
          },
          {
            description: {
              contains: keyword,
              mode: 'insensitive',
            },
          },
        ],
      });
    }

    if (query.actionType) {
      filters.push({
        actionType: query.actionType,
      });
    }

    if (fromDate || toDate) {
      const dateFilters: Prisma.CorporateActionWhereInput[] = [];

      if (fromDate) {
        dateFilters.push({
          OR: [
            {
              announcementDate: {
                gte: fromDate,
              },
            },
            {
              effectiveDate: {
                gte: fromDate,
              },
            },
          ],
        });
      }

      if (toDate) {
        dateFilters.push({
          OR: [
            {
              announcementDate: {
                lte: toDate,
              },
            },
            {
              effectiveDate: {
                lte: toDate,
              },
            },
          ],
        });
      }

      filters.push({
        AND: dateFilters,
      });
    }

    const where =
      filters.length > 0
        ? {
            AND: filters,
          }
        : undefined;

    return this.findAllWithWhere(where, page, pageSize, skip);
  }

  private async findAllWithWhere(
    where: Prisma.CorporateActionWhereInput | undefined,
    page: number,
    pageSize: number,
    skip?: number,
  ) {
    const offset = skip ?? (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      this.prisma.corporateAction.findMany({
        where,
        skip: offset,
        take: pageSize,
        orderBy: [
          {
            effectiveDate: 'desc',
          },
          {
            announcementDate: 'desc',
          },
          {
            createdAt: 'desc',
          },
        ],
        include: {
          company: {
            include: {
              listings: {
                include: {
                  exchange: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.corporateAction.count({
        where,
      }),
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        actionType: item.actionType,
        announcementDate: item.announcementDate,
        effectiveDate: item.effectiveDate,
        description: item.description,
        splitRatio: item.splitRatio,
        offeringPrice: item.offeringPrice,
        sharesOffered: item.sharesOffered?.toString() ?? null,
        company: {
          id: item.company.id,
          legalName: item.company.legalName,
          displayName: item.company.displayName,
        },
        listings: item.company.listings.map((listing) => ({
          id: listing.id,
          symbol: listing.symbol,
          exchange: listing.exchange.code,
        })),
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }

  private parseStartOfDay(value?: string) {
    if (!value) {
      return undefined;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return undefined;
    }

    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );
  }

  private parseEndOfDay(value?: string) {
    if (!value) {
      return undefined;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return undefined;
    }

    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
    );
  }
}
