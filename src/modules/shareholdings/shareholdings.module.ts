import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';
import { ShareholdingsController } from './shareholdings.controller';
import { ShareholdingsService } from './shareholdings.service';

@Module({
  imports: [PrismaModule],
  controllers: [ShareholdingsController],
  providers: [ShareholdingsService],
})
export class ShareholdingsModule {}
