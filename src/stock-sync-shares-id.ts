import 'dotenv/config';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { StockSyncModule } from './jobs/stock-sync/stock-sync.module';
import { SharesDataSyncService } from './jobs/stock-sync/sync/shares-data-sync.service';

async function bootstrap() {
    const logger =
        new Logger(
            'SharesDataSyncBootstrap',
        );

    const app =
        await NestFactory.createApplicationContext(
            StockSyncModule,
            {
                logger: [
                    'log',
                    'warn',
                    'error',
                ],
            },
        );

    try {
        const sharesDataSyncService =
            app.get(
                SharesDataSyncService,
            );

        const result =
            await sharesDataSyncService.syncAllFromPython();

        logger.log(
            `Done. companiesProcessed=${result.companiesProcessed} recordsUpserted=${result.recordsUpserted} skipped=${result.skipped}`,
        );
    } catch (error) {
        logger.error(
            `Shares data sync failed: ${
                error instanceof Error
                    ? error.message
                    : String(error)
            }`,
        );
        process.exitCode = 1;
    } finally {
        await app.close();
    }
}

bootstrap();
