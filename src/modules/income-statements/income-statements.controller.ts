import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';

import { AdminIncomeStatementsQueryDto } from './dto/admin-income-statements-query.dto';
import { SyncIncomeStatementsDto } from './dto/sync-income-statements.dto';
import { IncomeStatementsService } from './income-statements.service';

@Controller('admin/income-statements')
export class IncomeStatementsController {
  constructor(private readonly incomeStatementsService: IncomeStatementsService) {}

  @Post('sync')
  async syncIncomeStatements(@Body() body: SyncIncomeStatementsDto) {
    return this.incomeStatementsService.syncFromPythonBackend(body);
  }

  @Get()
  async getAllIncomeStatements(@Query() query: AdminIncomeStatementsQueryDto) {
    return this.incomeStatementsService.findAllAdmin(query);
  }

  @Get('company/:companyId')
  async getIncomeStatementsByCompany(
    @Param('companyId') companyId: string,
    @Query() query: AdminIncomeStatementsQueryDto,
  ) {
    return this.incomeStatementsService.findAllByCompanyAdmin(companyId, query);
  }

  @Get(':id')
  async getIncomeStatement(@Param('id') id: string) {
    return this.incomeStatementsService.findOneAdmin(id);
  }

  @Post()
  async createIncomeStatement(@Body() body: unknown) {
    return this.incomeStatementsService.createAdmin(body);
  }

  @Post('upsert')
  async upsertIncomeStatement(@Body() body: unknown) {
    return this.incomeStatementsService.upsertAdmin(body);
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
