import { Module } from '@nestjs/common';
import { FinancialStatementsController } from './financial-statements.controller';
import { FinancialStatementsService } from './financial-statements.service';

@Module({
  controllers: [FinancialStatementsController],
  providers: [FinancialStatementsService],
  exports: [FinancialStatementsService],
})
export class FinancialStatementsModule {}
