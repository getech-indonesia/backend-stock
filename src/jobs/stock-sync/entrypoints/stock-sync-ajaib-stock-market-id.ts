import 'dotenv/config';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { StockSyncModule } from '../stock-sync.module';
import { AjaibStockMarketSyncService } from '../sync/ajaib-stock-market-sync.service';

async function bootstrap() {
  const logger = new Logger('AjaibStockMarketSyncBootstrap');

  const app = await NestFactory.createApplicationContext(StockSyncModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const ajaibStockMarketSyncService = app.get(AjaibStockMarketSyncService);

    const result = await ajaibStockMarketSyncService.syncAllFromPython();

    logger.log(
      `Done. listingsProcessed=${result.listingsProcessed} listingsSucceeded=${result.listingsSucceeded} listingsFailed=${result.listingsFailed} listingsSkipped=${result.listingsSkipped} upserted=${result.upserted}`,
    );
  } catch (error) {
    logger.error(
      `Ajaib stock market sync failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

bootstrap();
