import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import { FinancialStatementSyncService } from '../../jobs/stock-sync/sync/financial-statement-sync.service';
import { StockPriceSyncService } from '../../jobs/stock-sync/sync/stock-price-sync.service';
import { StockPriceQueryDto } from './dto/stock-price-query.dto';
import { FindStocksQueryDto } from './dto/find-stocks-query.dto';
import { AdminIncomeStatementsQueryDto } from '../income-statements/dto/admin-income-statements-query.dto';
import { SyncFinancialStatementsQueryDto } from './dto/sync-financial-statements-query.dto';
import { SyncStockPricesQueryDto } from './dto/sync-stock-prices-query.dto';
import { CandlesQueryDto } from './dto/candles-query.dto';
import { TechnicalSeriesQueryDto } from './dto/technical-series-query.dto';
import { StocksService } from './stocks.service';

@Controller()
export class StocksController {
  constructor(
    private readonly stocksService: StocksService,
    private readonly financialStatementSyncService: FinancialStatementSyncService,
    private readonly stockPriceSyncService: StockPriceSyncService,
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

  @Get('admin/sectors')
  async getAdminSectors() {
    return this.stocksService.findAllSectors();
  }

  @Get('stock-price')
  async getStockPriceByListingIdAndDate(
    @Query() query: StockPriceQueryDto,
  ) {
    const stockPrice = await this.stocksService.findStockPriceByListingIdAndDate(
      query.listingId,
      query.date,
    );

    if (!stockPrice) {
      throw new NotFoundException(
        `Stock price for listing ${query.listingId} on ${query.date} not found`,
      );
    }

    return stockPrice;
  }

  @Get('admin/stocks/:symbol/stock-price')
  async getAdminStockPrice(
    @Param('symbol') symbol: string,
    @Query() query: CandlesQueryDto,
  ) {
    return this.getStockCandles(symbol, query);
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

  @Get('stocks/:symbol/candles')
  async getStockCandles(
    @Param('symbol') symbol: string,
    @Query() query: CandlesQueryDto,
  ) {
    const candles = await this.stocksService.findCandlesBySymbol(
      symbol,
      query,
    );

    if (!candles) {
      throw new NotFoundException(
        `Stock with symbol ${symbol} not found`,
      );
    }

    return candles;
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
    @Query() query: AdminIncomeStatementsQueryDto,
  ) {
    return this.stocksService.findKeyStatisticsBySymbol(symbol, query);
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

  @Post('admin/stock-prices/sync')
  async syncStockPrices(
    @Query() query: SyncStockPricesQueryDto,
  ) {
    return this.stockPriceSyncService.syncAllPricesWithUpsert(query.listingId);
  }

  @Post('admin/stock-prices/upsert')
  async upsertAdminStockPrices(@Body() body: unknown) {
    return this.stocksService.upsertAdminStockPrices(body);
  }

}
