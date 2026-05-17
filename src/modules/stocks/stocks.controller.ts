import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';

import { FindStocksQueryDto } from './dto/find-stocks-query.dto';
import { StocksService } from './stocks.service';

@Controller()
export class StocksController {
  constructor(
    private readonly stocksService: StocksService,
  ) {}

  @Get('stocks')
  async getStocks(
    @Query() query: FindStocksQueryDto,
  ) {
    return this.stocksService.findAll(query);
  }

  @Get('emiten')
  async getEmitens(
    @Query() query: FindStocksQueryDto,
  ) {
    return this.stocksService.findAll(query);
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

  @Get('emiten/:symbol')
  async getEmitenBySymbol(
    @Param('symbol') symbol: string,
  ) {
    return this.getStockBySymbol(symbol);
  }
}
