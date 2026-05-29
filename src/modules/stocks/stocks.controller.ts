import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import { FinancialStatementSyncService } from '../../jobs/stock-sync/sync/financial-statement-sync.service';
import { FindStocksQueryDto } from './dto/find-stocks-query.dto';
import { SyncFinancialStatementsQueryDto } from './dto/sync-financial-statements-query.dto';
import { StocksService } from './stocks.service';

@Controller()
export class StocksController {
  constructor(
    private readonly stocksService: StocksService,
    private readonly financialStatementSyncService: FinancialStatementSyncService,
  ) { }

  @Get('stocks')
  async getStocks(
    @Query() query: FindStocksQueryDto,
  ) {
    return this.stocksService.findAll(query);
  }

  @Get('sectors')
  async getSectors() {
    return this.stocksService.findAllSectors();
  }

  @Get('stocks/:symbol')
  async getStockBySymbol(
    @Param('symbol') symbol: string,
  ) {
    const stock =
      await this.stocksService.findOneBySymbol(
        symbol,
      );

    if (!stock) {
      throw new NotFoundException(
        `Stock with symbol ${symbol} not found`,
      );
    }

    return stock;
  }

  @Get('stocks/:symbol/financial-statements')
  async getStockFinancialStatements(
    @Param('symbol') symbol: string,
  ) {
    const financialStatements =
      await this.stocksService.findFinancialStatementsBySymbol(
        symbol,
      );

    if (!financialStatements) {
      throw new NotFoundException(
        `Stock with symbol ${symbol} not found`,
      );
    }

    return financialStatements;
  }

  @Post('stocks/financial-statements/sync')
  async syncFinancialStatements(
    @Query() query: SyncFinancialStatementsQueryDto,
  ) {
    const year = query.year ?? new Date().getUTCFullYear();
    return this.financialStatementSyncService.syncAllFromPython(year);
  }

}
