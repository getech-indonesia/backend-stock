import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AdminIndustriesQueryDto } from './dto/admin-industries-query.dto';
import { CreateIndustryDto } from './dto/create-industry.dto';
import { UpdateIndustryDto } from './dto/update-industry.dto';

@Injectable()
export class IndustriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllAdmin(query: AdminIndustriesQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const keyword = query.keyword?.trim() ?? query.q?.trim();

    const filters: Prisma.IndustryWhereInput[] = [];

    if (keyword) {
      filters.push({
        name: {
          contains: keyword,
          mode: 'insensitive',
        },
      });
    }

    if (query.sectorId) {
      filters.push({
        sectorId: query.sectorId,
      });
    }

    const where = filters.length > 0 ? { AND: filters } : undefined;

    const [items, total] = await Promise.all([
      this.prisma.industry.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: {
          name: 'asc',
        },
        include: {
          sector: true,
        },
      }),
      this.prisma.industry.count({ where }),
    ]);

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

  async findOneAdmin(id: string) {
    const industry = await this.prisma.industry.findUnique({
      where: { id },
      include: {
        sector: true,
      },
    });

    if (!industry) {
      throw new NotFoundException(`Industry with ID "${id}" not found`);
    }

    return industry;
  }

  async createAdmin(dto: CreateIndustryDto) {
    // Check if sector exists
    await this.ensureSectorExists(dto.sectorId);

    // Check unique constraint [name, sectorId]
    const existing = await this.prisma.industry.findUnique({
      where: {
        name_sectorId: {
          name: dto.name,
          sectorId: dto.sectorId,
        },
      },
    });

    if (existing) {
      throw new BadRequestException(
        `Industry "${dto.name}" already exists in the target sector`,
      );
    }

    return this.prisma.industry.create({
      data: dto,
      include: {
        sector: true,
      },
    });
  }

  async updateAdmin(id: string, dto: UpdateIndustryDto) {
    const current = await this.ensureIndustryExists(id);

    if (dto.sectorId) {
      await this.ensureSectorExists(dto.sectorId);
    }

    const nameToCheck = dto.name ?? current.name;
    const sectorIdToCheck = dto.sectorId ?? current.sectorId;

    if (dto.name !== undefined || dto.sectorId !== undefined) {
      const existing = await this.prisma.industry.findFirst({
        where: {
          name: nameToCheck,
          sectorId: sectorIdToCheck,
          id: { not: id },
        },
      });

      if (existing) {
        throw new BadRequestException(
          `Industry "${nameToCheck}" already exists in the target sector`,
        );
      }
    }

    return this.prisma.industry.update({
      where: { id },
      data: dto,
      include: {
        sector: true,
      },
    });
  }

  async deleteAdmin(id: string) {
    await this.ensureIndustryExists(id);

    const companiesCount = await this.prisma.company.count({
      where: { industryId: id },
    });

    if (companiesCount > 0) {
      throw new BadRequestException(
        `Cannot delete industry: it has ${companiesCount} associated companies`,
      );
    }

    return this.prisma.industry.delete({
      where: { id },
    });
  }

  private async ensureSectorExists(sectorId: string) {
    const sector = await this.prisma.sector.findUnique({
      where: { id: sectorId },
      select: { id: true },
    });

    if (!sector) {
      throw new NotFoundException(`Sector with ID "${sectorId}" not found`);
    }
  }

  private async ensureIndustryExists(id: string) {
    const industry = await this.prisma.industry.findUnique({
      where: { id },
    });

    if (!industry) {
      throw new NotFoundException(`Industry with ID "${id}" not found`);
    }

    return industry;
  }
}
