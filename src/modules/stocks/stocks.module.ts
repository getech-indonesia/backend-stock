import { Module } from '@nestjs/common';

import { StockSyncModule } from '../../jobs/stock-sync/stock-sync.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { IncomeStatementsModule } from '../income-statements/income-statements.module';
import { StocksController } from './stocks.controller';
import { StocksService } from './stocks.service';

@Module({
  imports: [PrismaModule, StockSyncModule, IncomeStatementsModule],
  controllers: [StocksController],
  providers: [StocksService],
})
export class StocksModule { }
