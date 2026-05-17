import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { FindStocksQueryDto } from './dto/find-stocks-query.dto';

@Injectable()
export class StocksService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async findAll(
    query: FindStocksQueryDto,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const keyword = query.q?.trim();

    const where = keyword
      ? {
          OR: [
            {
              symbol: {
                contains: keyword,
                mode: 'insensitive' as const,
              },
            },
            {
              company: {
                OR: [
                  {
                    displayName: {
                      contains: keyword,
                      mode: 'insensitive' as const,
                    },
                  },
                  {
                    legalName: {
                      contains: keyword,
                      mode: 'insensitive' as const,
                    },
                  },
                ],
              },
            },
          ],
        }
      : undefined;

    const [items, total] =
      await Promise.all([
        this.prisma.listing.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: {
            symbol: 'asc',
          },
          include: {
            exchange: true,
            company: {
              include: {
                country: true,
                industry: {
                  include: {
                    sector: true,
                  },
                },
              },
            },
          },
        }),
        this.prisma.listing.count({ where }),
      ]);

    return {
      items: items.map((item) => ({
        listing: {
          id: item.id,
          symbol: item.symbol,
          assetType: item.assetType,
          isin: item.isin,
          cusip: item.cusip,
        },
        exchange: {
          code: item.exchange.code,
          name: item.exchange.name,
          timezone: item.exchange.timezone,
          exchangeType: item.exchange.exchangeType,
        },
        company: {
          id: item.company.id,
          legalName: item.company.legalName,
          displayName: item.company.displayName,
          description: item.company.description,
          website: item.company.website,
          logoUrl: item.company.logoUrl,
          ceo: item.company.ceo,
          foundedYear: item.company.foundedYear,
          employeeCount: item.company.employeeCount,
          headquarters: item.company.headquarters,
          status: item.company.status,
        },
        country: item.company.country,
        sector: {
          name: item.company.industry.sector.name,
        },
        industry: {
          name: item.company.industry.name,
        },
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages:
          total === 0
            ? 0
            : Math.ceil(total / pageSize),
      },
    };
  }

  async findOneBySymbol(symbol: string) {
    return this.prisma.listing.findFirst({
      where: {
        symbol: {
          equals: symbol,
          mode: 'insensitive',
        },
      },
      include: {
        exchange: true,
        company: {
          include: {
            country: true,
            industry: {
              include: {
                sector: true,
              },
            },
          },
        },
      },
    });
  }
}
