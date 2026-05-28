import 'dotenv/config';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { StockSyncModule } from '../stock-sync.module';
import { StockPriceSyncService } from '../sync/stock-price-sync.service';

async function bootstrap() {
  const logger = new Logger('StockPriceSyncIdBootstrap');

  const app = await NestFactory.createApplicationContext(StockSyncModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const stockPriceSyncService = app.get(StockPriceSyncService);

    const result = await stockPriceSyncService.syncAllFromPython();

    logger.log(
      `Done. listingsProcessed=${result.listingsProcessed} listingsFailed=${result.listingsFailed} rowsInserted=${result.rowsInserted} rowsUpdated=${result.rowsUpdated} rowsSkipped=${result.rowsSkipped}`,
    );
  } catch (error) {
    logger.error(
      `Stock price sync failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

bootstrap();
