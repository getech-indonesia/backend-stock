import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';
import { IncomeStatementsController } from './income-statements.controller';
import { IncomeStatementsService } from './income-statements.service';

@Module({
  imports: [PrismaModule],
  controllers: [IncomeStatementsController],
  providers: [IncomeStatementsService],
  exports: [IncomeStatementsService],
})
export class IncomeStatementsModule { }
