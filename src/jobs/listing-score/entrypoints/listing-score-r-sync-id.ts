import 'dotenv/config';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { ListingsModule } from '../../../modules/listings/listings.module';
import { ListingScoreSyncService } from '../../../modules/listings/services/listing-score-sync.service';

function parseDateArg(args: string[]): Date | null {
  const npmConfigDate = process.env.npm_config_date;
  const flag = args.find((arg) => arg.startsWith('--date='));
  const flagValue = flag?.split('=')[1];
  const flagIndex = args.findIndex((arg) => arg === '--date');
  const nextArg =
    flagIndex >= 0 && args[flagIndex + 1] ? args[flagIndex + 1] : undefined;
  const rawDate = flagValue ?? nextArg ?? npmConfigDate;

  if (!rawDate) {
    return null;
  }

  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(
      `Invalid date "${rawDate}". Use ISO date or YYYY-MM-DD, e.g. --date=2026-07-17`,
    );
  }

  return parsed;
}

async function bootstrap() {
  const logger = new Logger('ListingScoreRSyncBootstrap');
  const scoreDate = parseDateArg(process.argv.slice(2)) ?? new Date();

  const app = await NestFactory.createApplicationContext(ListingsModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const listingScoreSyncService = app.get(ListingScoreSyncService);
    const result = await listingScoreSyncService.syncRelativeStrengthDaily(
      scoreDate,
    );

    logger.log(
      `Done. scoreDate=${result.scoreDate.toISOString()} updated=${result.updated} skipped=${result.skipped}`,
    );
  } catch (error) {
    logger.error(
      `Listing score R sync failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

bootstrap();
