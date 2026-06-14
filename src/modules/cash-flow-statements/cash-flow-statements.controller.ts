import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';

import { AdminCashFlowStatementsQueryDto } from './dto/admin-cash-flow-statements-query.dto';
import { CashFlowStatementsService } from './cash-flow-statements.service';

@Controller('admin/cash-flow-statements')
export class CashFlowStatementsController {
  constructor(private readonly cashFlowStatementsService: CashFlowStatementsService) {}

  @Get()
  async getAllCashFlowStatements(@Query() query: AdminCashFlowStatementsQueryDto) {
    return this.cashFlowStatementsService.findAllAdmin(query);
  }

  @Get('company/:companyId')
  async getCashFlowStatementsByCompany(
    @Param('companyId') companyId: string,
    @Query() query: AdminCashFlowStatementsQueryDto,
  ) {
    return this.cashFlowStatementsService.findAllByCompanyAdmin(companyId, query);
  }

  @Get(':id')
  async getCashFlowStatement(@Param('id') id: string) {
    return this.cashFlowStatementsService.findOneAdmin(id);
  }

  @Post()
  async createCashFlowStatement(@Body() body: unknown) {
    return this.cashFlowStatementsService.createAdmin(body);
  }

  @Post('upsert')
  async upsertCashFlowStatement(@Body() body: unknown) {
    return this.cashFlowStatementsService.upsertAdmin(body);
  }

  @Patch('batch')
  async batchUpdateCashFlowStatements(@Body() body: unknown) {
    return this.cashFlowStatementsService.batchUpdateAdmin(body);
  }

  @Patch(':id')
  async updateCashFlowStatement(@Param('id') id: string, @Body() body: unknown) {
    return this.cashFlowStatementsService.updateAdmin(id, body);
  }
}
