import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { PrismaModule } from '../../prisma/prisma.module';
import { PubExController } from './pubex.controller';
import { PubExGateway } from './pubex.gateway';
import { PubExProcessor } from './pubex.processor';
import { PubExService } from './pubex.service';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({
      name: 'pubex-parse',
    }),
  ],
  controllers: [PubExController],
  providers: [PubExService, PubExProcessor, PubExGateway],
})
export class PubExModule {}

