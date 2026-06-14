import 'dotenv/config';

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

import { PrismaModule } from './prisma/prisma.module';

import { AuthModule } from './modules/auth/auth.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { CorporateActionsModule } from './modules/corporate-actions/corporate-actions.module';
import { BalanceSheetsModule } from './modules/balance-sheets/balance-sheets.module';
import { CashFlowStatementsModule } from './modules/cash-flow-statements/cash-flow-statements.module';
import { IncomeStatementsModule } from './modules/income-statements/income-statements.module';
import { PubExModule } from './modules/pubex/pubex.module';
import { StocksModule } from './modules/stocks/stocks.module';

function isEnabled(value: string | undefined, defaultValue = true): boolean {
  if (value == null) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  return normalized !== 'false' && normalized !== '0' && normalized !== 'no';
}

@Module({
  imports: (() => {
    const enablePubEx = isEnabled(process.env.ENABLE_PUBEX, true);

    return [
      ConfigModule.forRoot({
        isGlobal: true,
      }),

      PrismaModule,
      ...(enablePubEx
        ? [
            BullModule.forRoot({
              connection: {
                host: process.env.REDIS_HOST ?? '127.0.0.1',
                port: Number.parseInt(process.env.REDIS_PORT ?? '6379', 10),
                password: process.env.REDIS_PASSWORD || undefined,
              },
            }),
            PubExModule,
          ]
        : []),

      AuthModule,
      CompaniesModule,
      CorporateActionsModule,
      BalanceSheetsModule,
      CashFlowStatementsModule,
      IncomeStatementsModule,
      StocksModule,
    ];
  })(),
})
export class AppModule {}
