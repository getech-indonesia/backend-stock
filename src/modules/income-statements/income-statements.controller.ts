import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';

import { AdminIncomeStatementsQueryDto } from './dto/admin-income-statements-query.dto';
import { IncomeStatementsService } from './income-statements.service';

@Controller('admin/income-statements')
export class IncomeStatementsController {
  constructor(private readonly incomeStatementsService: IncomeStatementsService) {}

  @Get()
  async getAllIncomeStatements(@Query() query: AdminIncomeStatementsQueryDto) {
    return this.incomeStatementsService.findAllAdmin(query);
  }

  @Get(':id')
  async getIncomeStatement(@Param('id') id: string) {
    return this.incomeStatementsService.findOneAdmin(id);
  }

  @Post()
  async createIncomeStatement(@Body() body: unknown) {
    return this.incomeStatementsService.createAdmin(body);
  }

  @Patch('batch')
  async batchUpdateIncomeStatements(@Body() body: unknown) {
    return this.incomeStatementsService.batchUpdateAdmin(body);
  }

  @Patch(':id')
  async updateIncomeStatement(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.incomeStatementsService.updateAdmin(id, body);
  }
}
