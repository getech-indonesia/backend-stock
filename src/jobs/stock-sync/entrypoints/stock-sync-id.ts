import 'dotenv/config';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { StockSyncModule } from '../stock-sync.module';
import { StockSyncService } from '../stock-sync.service';

async function bootstrap() {
  const logger = new Logger('StockSyncIdBootstrap');

  const app = await NestFactory.createApplicationContext(StockSyncModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const stockSyncService = app.get(StockSyncService);

    const stocks = await stockSyncService.syncIndonesia();

    const preview = stocks.slice(0, 5);

    logger.log(`Done. Total stocks: ${stocks.length}`);
    logger.log(
      `Preview (first ${preview.length} rows):\n${JSON.stringify(preview, null, 2)}`,
    );
  } catch (error) {
    logger.error(
      `Stock sync failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

bootstrap();
