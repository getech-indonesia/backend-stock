import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';
import { IndustriesController } from './industries.controller';
import { IndustriesService } from './industries.service';

@Module({
  imports: [PrismaModule],
  controllers: [IndustriesController],
  providers: [IndustriesService],
})
export class IndustriesModule {}
