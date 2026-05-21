import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { FindCorporateActionsQueryDto } from './dto/find-corporate-actions-query.dto';

@Injectable()
export class CorporateActionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindCorporateActionsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const symbol = query.symbol?.trim().toUpperCase();

    const where = symbol
      ? {
          company: {
            listings: {
              some: {
                symbol: {
                  equals: symbol,
                  mode: 'insensitive' as const,
                },
              },
            },
          },
        }
      : undefined;

    const [items, total] = await Promise.all([
      this.prisma.corporateAction.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [
          {
            effectiveDate: 'desc',
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
}
