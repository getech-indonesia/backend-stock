import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AdminCompaniesQueryDto } from './dto/admin-companies-query.dto';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) { }

  async findAllAdmin(query: AdminCompaniesQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const keyword = query.keyword?.trim();

    const where: Prisma.CompanyWhereInput | undefined = keyword
      ? {
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
        }
      : undefined;

    const [items, total] = await Promise.all([
      this.prisma.company.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: {
          displayName: 'asc',
        },
        include: {
          country: true,
          industry: {
            include: {
              sector: true,
            },
          },
          listings: {
            orderBy: {
              symbol: 'asc',
            },
            select: {
              id: true,
              symbol: true,
              isin: true,
              cusip: true,
              assetType: true,
              ipoDate: true,
              exchange: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  exchangeType: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.company.count({ where }),
    ]);

    return {
      items: items.map((company) => this.mapCompany(company)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }

  private mapCompany(company: any) {
    return {
      id: company.id,
      legalName: company.legalName,
      displayName: company.displayName,
      description: company.description,
      foundedYear: company.foundedYear,
      website: company.website,
      logoUrl: company.logoUrl,
      employeeCount: company.employeeCount,
      ceo: company.ceo,
      headquarters: company.headquarters,
      status: company.status,
      fiscalYearEndMonth: company.fiscalYearEndMonth,
      country: company.country,
      industry: {
        id: company.industry.id,
        name: company.industry.name,
        sector: {
          id: company.industry.sector.id,
          name: company.industry.sector.name,
        },
      },
      listings: company.listings.map((listing: any) => ({
        id: listing.id,
        symbol: listing.symbol,
        isin: listing.isin,
        cusip: listing.cusip,
        assetType: listing.assetType,
        ipoDate: listing.ipoDate,
        exchange: listing.exchange,
      })),
    };
  }
}
