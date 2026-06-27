import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { FinancialStatementsController } from './financial-statements.controller';
import { FinancialStatementsService } from './financial-statements.service';

@Module({
  imports: [PrismaModule],
  controllers: [FinancialStatementsController],
  providers: [FinancialStatementsService],
  exports: [FinancialStatementsService],
})
export class FinancialStatementsModule {}
