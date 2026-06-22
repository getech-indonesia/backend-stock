import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AdminGroveFormulasQueryDto } from './dto/admin-grove-formulas-query.dto';

@Injectable()
export class GroveFormulasService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllAdmin(query: AdminGroveFormulasQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const keyword = query.keyword?.trim();

    const where: Prisma.GroveFormulaWhereInput | undefined = keyword
      ? {
          OR: [
            {
              code: {
                contains: keyword,
                mode: 'insensitive',
              },
            },
            {
              description: {
                contains: keyword,
                mode: 'insensitive',
              },
            },
          ],
        }
      : undefined;

    const [items, total] = await Promise.all([
      this.prisma.groveFormula.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { code: 'asc' },
      }),
      this.prisma.groveFormula.count({ where }),
    ]);

    return {
      items: items.map((f) => ({
        id: f.id,
        code: f.code,
        description: f.description,
        isActive: f.isActive,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }

  async findOneAdmin(id: string) {
    const formula = await this.prisma.groveFormula.findUnique({ where: { id } });
    if (!formula) {
      throw new NotFoundException('Grove formula not found');
    }

    const rules = await this.prisma.groveRule.findMany({
      where: { formulaId: id },
      orderBy: { createdAt: 'asc' },
    });

    return {
      formula: {
        id: formula.id,
        code: formula.code,
        description: formula.description,
        isActive: formula.isActive,
        createdAt: formula.createdAt,
        updatedAt: formula.updatedAt,
      },
      rules: rules.map((r) => ({
        id: r.id,
        pillar: r.pillar,
        metric: r.metric,
        score: r.score,
        description: r.description,
        createdAt: r.createdAt,
      })),
    };
  }
}
