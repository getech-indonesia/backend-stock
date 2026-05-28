import 'dotenv/config';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { StockSyncModule } from '../stock-sync.module';
import { FinancialStatementSyncService } from '../sync/financial-statement-sync.service';

function parseYearFromArgs(args: string[]): number {
  const currentYear = new Date().getUTCFullYear();

  const yearFlag = args.find((arg) => arg.startsWith('--year='));
  const yearFlagValue = yearFlag?.split('=')[1];
  const yearFlagIndex = args.findIndex((arg) => arg === '--year');
  const yearByNextArg =
    yearFlagIndex >= 0 && args[yearFlagIndex + 1]
      ? args[yearFlagIndex + 1]
      : undefined;
  const yearPositional = args.find((arg) => /^\d{4}$/.test(arg));
  const rawYear = yearFlagValue ?? yearByNextArg ?? yearPositional;

  if (!rawYear) {
    return currentYear;
  }

  const year = Number(rawYear);

  if (!Number.isInteger(year) || year < 1900 || year > 9999) {
    throw new Error(
      `Invalid year "${rawYear}". Use year between 1900 and 9999, e.g. --year=2025`,
    );
  }

  return year;
}

async function bootstrap() {
  const logger = new Logger('FinancialStatementSyncBootstrap');
  const year = parseYearFromArgs(process.argv.slice(2));

  const app = await NestFactory.createApplicationContext(StockSyncModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const financialStatementSyncService = app.get(
      FinancialStatementSyncService,
    );

    const result = await financialStatementSyncService.syncAllFromPython(year);

    logger.log(
      `Done. year=${result.year} companiesProcessed=${result.companiesProcessed} companiesSucceeded=${result.companiesSucceeded} companiesFailed=${result.companiesFailed} companiesSkipped=${result.companiesSkipped} incomeStatementsUpserted=${result.incomeStatementsUpserted} balanceSheetsUpserted=${result.balanceSheetsUpserted} cashFlowStatementsUpserted=${result.cashFlowStatementsUpserted}`,
    );
  } catch (error) {
    logger.error(
      `Financial statement sync failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

bootstrap();
