import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';

import { AdminBalanceSheetsQueryDto } from './dto/admin-balance-sheets-query.dto';
import { BalanceSheetsService } from './balance-sheets.service';

@Controller('admin/balance-sheets')
export class BalanceSheetsController {
  constructor(private readonly balanceSheetsService: BalanceSheetsService) {}

  @Get()
  async getAllBalanceSheets(@Query() query: AdminBalanceSheetsQueryDto) {
    return this.balanceSheetsService.findAllAdmin(query);
  }

  @Get(':id')
  async getBalanceSheet(@Param('id') id: string) {
    return this.balanceSheetsService.findOneAdmin(id);
  }

  @Post()
  async createBalanceSheet(@Body() body: unknown) {
    return this.balanceSheetsService.createAdmin(body);
  }

  @Post('upsert')
  async upsertBalanceSheet(@Body() body: unknown) {
    return this.balanceSheetsService.upsertAdmin(body);
  }

  @Patch('batch')
  async batchUpdateBalanceSheets(@Body() body: unknown) {
    return this.balanceSheetsService.batchUpdateAdmin(body);
  }

  @Patch(':id')
  async updateBalanceSheet(@Param('id') id: string, @Body() body: unknown) {
    return this.balanceSheetsService.updateAdmin(id, body);
  }
}
