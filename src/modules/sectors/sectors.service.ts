import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AdminSectorsQueryDto } from './dto/admin-sectors-query.dto';
import { CreateSectorDto } from './dto/create-sector.dto';
import { UpdateSectorDto } from './dto/update-sector.dto';

@Injectable()
export class SectorsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllAdmin(query: AdminSectorsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const keyword = query.keyword?.trim() ?? query.q?.trim();

    const where: Prisma.SectorWhereInput | undefined = keyword
      ? {
          name: {
            contains: keyword,
            mode: 'insensitive',
          },
        }
      : undefined;

    const [items, total] = await Promise.all([
      this.prisma.sector.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: {
          name: 'asc',
        },
      }),
      this.prisma.sector.count({ where }),
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
    const sector = await this.prisma.sector.findUnique({
      where: { id },
      include: {
        industries: {
          orderBy: {
            name: 'asc',
          },
        },
      },
    });

    if (!sector) {
      throw new NotFoundException(`Sector with ID "${id}" not found`);
    }

    return sector;
  }

  async createAdmin(dto: CreateSectorDto) {
    const existing = await this.prisma.sector.findUnique({
      where: { name: dto.name },
    });

    if (existing) {
      throw new BadRequestException(`Sector with name "${dto.name}" already exists`);
    }

    return this.prisma.sector.create({
      data: {
        name: dto.name,
      },
    });
  }

  async updateAdmin(id: string, dto: UpdateSectorDto) {
    await this.ensureSectorExists(id);

    if (dto.name) {
      const existing = await this.prisma.sector.findFirst({
        where: {
          name: dto.name,
          id: { not: id },
        },
      });

      if (existing) {
        throw new BadRequestException(`Sector with name "${dto.name}" already exists`);
      }
    }

    return this.prisma.sector.update({
      where: { id },
      data: dto,
    });
  }

  async deleteAdmin(id: string) {
    await this.ensureSectorExists(id);

    const industriesCount = await this.prisma.industry.count({
      where: { sectorId: id },
    });

    if (industriesCount > 0) {
      throw new BadRequestException(
        `Cannot delete sector: it has ${industriesCount} associated industries`,
      );
    }

    return this.prisma.sector.delete({
      where: { id },
    });
  }

  private async ensureSectorExists(id: string) {
    const sector = await this.prisma.sector.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!sector) {
      throw new NotFoundException(`Sector with ID "${id}" not found`);
    }
  }
}
