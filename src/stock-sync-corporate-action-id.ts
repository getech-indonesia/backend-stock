import 'dotenv/config';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { StockSyncModule } from './jobs/stock-sync/stock-sync.module';
import { CorporateActionSyncService } from './jobs/stock-sync/sync/corporate-action-sync.service';

async function bootstrap() {
  const logger = new Logger('CorporateActionSyncBootstrap');

  const app = await NestFactory.createApplicationContext(StockSyncModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const corporateActionSyncService = app.get(CorporateActionSyncService);

    const result = await corporateActionSyncService.syncAllFromPython();

    logger.log(
      `Done. rowsFetched=${result.rowsFetched} rowsInserted=${result.rowsInserted} rowsUpdated=${result.rowsUpdated} rowsSkipped=${result.rowsSkipped} unmatchedSymbols=${result.unmatchedSymbols}`,
    );
  } catch (error) {
    logger.error(
      `Corporate action sync failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

bootstrap();
