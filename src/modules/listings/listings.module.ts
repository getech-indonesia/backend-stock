import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';
import { ListingScoreCalculator } from './services/listing-score.calculator';

@Module({
  imports: [PrismaModule],
  controllers: [ListingsController],
  providers: [ListingsService, ListingScoreCalculator],
})
export class ListingsModule {}
