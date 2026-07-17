import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';
import { ListingScoreCalculator } from './services/listing-score.calculator';
import { ListingScoreStoreService } from './services/listing-score-store.service';
import { ListingScoreSyncService } from './services/listing-score-sync.service';

@Module({
  imports: [PrismaModule],
  controllers: [ListingsController],
  providers: [
    ListingsService,
    ListingScoreCalculator,
    ListingScoreStoreService,
    ListingScoreSyncService,
  ],
  exports: [
    ListingScoreCalculator,
    ListingScoreStoreService,
    ListingScoreSyncService,
  ],
})
export class ListingsModule {}
