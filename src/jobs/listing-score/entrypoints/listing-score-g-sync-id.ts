import 'dotenv/config';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { ListingsModule } from '../../../modules/listings/listings.module';
import { ListingScoreSyncService } from '../../../modules/listings/services/listing-score-sync.service';

function parseCompanyIdArg(args: string[]): string | null {
  const npmConfigCompanyId = process.env.npm_config_companyId;
  const flag = args.find((arg) => arg.startsWith('--companyId='));
  const flagValue = flag?.split('=')[1];
  const flagIndex = args.findIndex((arg) => arg === '--companyId');
  const nextArg =
    flagIndex >= 0 && args[flagIndex + 1] ? args[flagIndex + 1] : undefined;
  const rawCompanyId = flagValue ?? nextArg ?? npmConfigCompanyId;

  return rawCompanyId?.trim() || null;
}

async function bootstrap() {
  const logger = new Logger('ListingScoreGSyncBootstrap');
  const companyId = parseCompanyIdArg(process.argv.slice(2));

  const app = await NestFactory.createApplicationContext(ListingsModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const listingScoreSyncService = app.get(ListingScoreSyncService);

    if (companyId) {
      const result = await listingScoreSyncService.syncGrowthForCompany(
        companyId,
      );

      logger.log(
        `Done. companyId=${result.companyId} updated=${result.updated} scoreDate=${result.scoreDate.toISOString()}`,
      );
    } else {
      const result = await listingScoreSyncService.syncGrowthForAllCompanies();

      logger.log(
        `Done. companiesProcessed=${result.companiesProcessed} updated=${result.updated} skipped=${result.skipped} scoreDate=${result.scoreDate.toISOString()}`,
      );
    }
  } catch (error) {
    logger.error(
      `Listing score G sync failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

bootstrap();
