import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';
import { BalanceSheetsController } from './balance-sheets.controller';
import { BalanceSheetsService } from './balance-sheets.service';

@Module({
  imports: [PrismaModule],
  controllers: [BalanceSheetsController],
  providers: [BalanceSheetsService],
})
export class BalanceSheetsModule {}
