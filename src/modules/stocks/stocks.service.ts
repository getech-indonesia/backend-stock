import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { FindStocksQueryDto } from './dto/find-stocks-query.dto';

@Injectable()
export class StocksService {
  constructor(
    private readonly prisma: PrismaService,
  ) { }

  async findAllSectors() {
    return this.prisma.sector.findMany({
      orderBy: {
        name: 'asc',
      },
      include: {
        industries: {
          orderBy: {
            name: 'asc',
          },
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async findAll(
    query: FindStocksQueryDto,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const keyword = query.q?.trim();
    const sector = query.sector?.trim();
    const isAllSector = sector?.toLowerCase() === 'all';
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

    if (sector && !isAllSector) {
      filters.push({
        company: {
          industry: {
            sector: {
              name: {
                equals: sector,
                mode: 'insensitive',
              },
            },
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
            stockPrices: {
              take: 2,
              orderBy: {
                date: 'desc',
              },
            },
            ajaibStockMarket: {
              select: {
                marketCap: true,
              },
            },
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
      items: items.map((item) => {
        const latestStockPrice = item.stockPrices[0];
        const previousStockPrice = item.stockPrices[1];

        let priceComparison: {
          latestDate: Date;
          latestClose: string;
          previousDate: Date;
          previousClose: string;
          change: string;
          changePct: string | null;
          direction: 'UP' | 'DOWN' | 'FLAT';
        } | null = null;

        if (latestStockPrice && previousStockPrice) {
          const latestClose = latestStockPrice.close;
          const previousClose = previousStockPrice.close;
          const change = latestClose.sub(previousClose);
          const changePct =
            previousClose.isZero()
              ? null
              : change.div(previousClose).mul(100);
          const direction =
            change.gt(0)
              ? 'UP'
              : change.lt(0)
                ? 'DOWN'
                : 'FLAT';

          priceComparison = {
            latestDate: latestStockPrice.date,
            latestClose: latestClose.toString(),
            previousDate: previousStockPrice.date,
            previousClose: previousClose.toString(),
            change: change.toString(),
            changePct: changePct?.toString() ?? null,
            direction,
          };
        }

        return {
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
          latestStockPrice:
            latestStockPrice
              ? {
                date: latestStockPrice.date,
                open:
                  latestStockPrice.open.toString(),
                high:
                  latestStockPrice.high.toString(),
                low:
                  latestStockPrice.low.toString(),
                close:
                  latestStockPrice.close.toString(),
                adjClose:
                  latestStockPrice.adjClose?.toString() ??
                  null,
                volume:
                  latestStockPrice.volume.toString(),
                value:
                  latestStockPrice.value?.toString() ??
                  null,
              }
              : null,
          priceComparison,
          marketCap:
            item.ajaibStockMarket?.marketCap.toString() ??
            null,
        };
      }),
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
