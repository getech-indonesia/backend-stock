import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';
import { StocksController } from './stocks.controller';
import { StocksService } from './stocks.service';

@Module({
  imports: [PrismaModule],
  controllers: [StocksController],
  providers: [StocksService],
})
export class StocksModule {}
