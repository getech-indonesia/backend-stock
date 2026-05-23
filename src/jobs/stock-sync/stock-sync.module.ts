import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';

import { AjaibStockScraper } from './scrapers/ajaib-stock.scraper';
import { AjaibStockMarketSyncCommand } from './ajaib-stock-market-sync.command';
import { CorporateActionSyncCommand } from './corporate-action-sync.command';
import { IdxStockScraper } from './scrapers/idx-stock.scraper';
import { SharesDataSyncCommand } from './shares-data-sync.command';
import { StockSyncCommand } from './stock-sync.command';
import { AjaibStockMarketSyncService } from './sync/ajaib-stock-market-sync.service';
import { CorporateActionSyncService } from './sync/corporate-action-sync.service';
import { FinancialStatementSyncService } from './sync/financial-statement-sync.service';
import { SharesDataSyncService } from './sync/shares-data-sync.service';
import { StockPriceSyncService } from './sync/stock-price-sync.service';
import { StockSyncService } from './stock-sync.service';

@Module({
  imports: [PrismaModule],
  providers: [
    AjaibStockScraper,
    AjaibStockMarketSyncCommand,
    AjaibStockMarketSyncService,
    CorporateActionSyncCommand,
    CorporateActionSyncService,
    FinancialStatementSyncService,
    IdxStockScraper,
    SharesDataSyncCommand,
    SharesDataSyncService,
    StockPriceSyncService,
    StockSyncCommand,
    StockSyncService,
  ],
  exports: [
    CorporateActionSyncService,
    FinancialStatementSyncService,
    StockPriceSyncService,
    StockSyncService,
  ],
})
export class StockSyncModule { }
