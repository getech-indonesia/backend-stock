import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';
import { CashFlowStatementsController } from './cash-flow-statements.controller';
import { CashFlowStatementsService } from './cash-flow-statements.service';

@Module({
  imports: [PrismaModule],
  controllers: [CashFlowStatementsController],
  providers: [CashFlowStatementsService],
})
export class CashFlowStatementsModule {}
