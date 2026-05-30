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
import { KeyStatisticsQueryDto } from './dto/key-statistics-query.dto';
import { SyncFinancialStatementsQueryDto } from './dto/sync-financial-statements-query.dto';
import { TechnicalSeriesQueryDto } from './dto/technical-series-query.dto';
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

  @Get('stocks/:symbol/overview')
  async getStockOverview(
    @Param('symbol') symbol: string,
    @Query() query: TechnicalSeriesQueryDto,
  ) {
    const overview = await this.stocksService.findOverviewBySymbol(
      symbol,
      query,
    );

    if (!overview) {
      throw new NotFoundException(
        `Stock with symbol ${symbol} not found`,
      );
    }

    return overview;
  }

  @Get('stocks/:symbol/technical-series')
  async getStockTechnicalSeries(
    @Param('symbol') symbol: string,
    @Query() query: TechnicalSeriesQueryDto,
  ) {
    const series = await this.stocksService.findTechnicalSeriesBySymbol(
      symbol,
      query,
    );

    if (!series) {
      throw new NotFoundException(
        `Stock with symbol ${symbol} not found`,
      );
    }

    return series;
  }

  @Get('stocks/:symbol/wyckoff')
  async getStockWyckoff(
    @Param('symbol') symbol: string,
    @Query() query: TechnicalSeriesQueryDto,
  ) {
    const wyckoff = await this.stocksService.findWyckoffBySymbol(
      symbol,
      query,
    );

    if (!wyckoff) {
      throw new NotFoundException(
        `Stock with symbol ${symbol} not found`,
      );
    }

    return wyckoff;
  }

  @Get('stocks/:symbol/technical-summary')
  async getStockTechnicalSummary(
    @Param('symbol') symbol: string,
    @Query() query: TechnicalSeriesQueryDto,
  ) {
    const summary = await this.stocksService.findTechnicalSummaryBySymbol(
      symbol,
      query,
    );

    if (!summary) {
      throw new NotFoundException(
        `Stock with symbol ${symbol} not found`,
      );
    }

    return summary;
  }

  @Get('stocks/:symbol/key-statistics')
  async getStockKeyStatistics(
    @Param('symbol') symbol: string,
    @Query() query: KeyStatisticsQueryDto,
  ) {
    const data = await this.stocksService.findKeyStatisticsBySymbol(
      symbol,
      query,
    );

    if (!data) {
      throw new NotFoundException(
        `Stock with symbol ${symbol} not found`,
      );
    }

    return data;
  }

  @Get('stocks/:symbol/key-statistics-summary')
  async getStockKeyStatisticsSummary(
    @Param('symbol') symbol: string,
  ) {
    const data = await this.stocksService.findKeyStatisticsSummaryBySymbol(symbol);

    if (!data) {
      throw new NotFoundException(
        `Stock with symbol ${symbol} not found`,
      );
    }

    return data;
  }

  @Post('stocks/financial-statements/sync')
  async syncFinancialStatements(
    @Query() query: SyncFinancialStatementsQueryDto,
  ) {
    const year = query.year ?? new Date().getUTCFullYear();
    return this.financialStatementSyncService.syncAllFromPython(year);
  }

}
