import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';

import { AjaibStockScraper } from './scrapers/ajaib-stock.scraper';
import { IdxStockScraper } from './scrapers/idx-stock.scraper';
import { SharesDataSyncCommand } from './shares-data-sync.command';
import { StockSyncCommand } from './stock-sync.command';
import { SharesDataSyncService } from './sync/shares-data-sync.service';
import { StockPriceSyncService } from './sync/stock-price-sync.service';
import { StockSyncService } from './stock-sync.service';

@Module({
    imports: [PrismaModule],
    providers: [
        AjaibStockScraper,
        IdxStockScraper,
        SharesDataSyncCommand,
        SharesDataSyncService,
        StockPriceSyncService,
        StockSyncCommand,
        StockSyncService,
    ],
    exports: [
        StockPriceSyncService,
        StockSyncService,
    ],
})
export class StockSyncModule {}
