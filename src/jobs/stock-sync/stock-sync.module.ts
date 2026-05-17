import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';

import { AjaibStockScraper } from './scrapers/ajaib-stock.scraper';
import { IdxStockScraper } from './scrapers/idx-stock.scraper';
import { StockSyncCommand } from './stock-sync.command';
import { StockSyncService } from './stock-sync.service';

@Module({
    imports: [PrismaModule],
    providers: [
        AjaibStockScraper,
        IdxStockScraper,
        StockSyncCommand,
        StockSyncService,
    ],
    exports: [StockSyncService],
})
export class StockSyncModule {}
