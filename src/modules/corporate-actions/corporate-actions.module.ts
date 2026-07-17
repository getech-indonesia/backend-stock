import { Module } from '@nestjs/common';

import { CorporateActionSyncService } from '../../jobs/stock-sync/sync/corporate-action-sync.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminCorporateActionsController } from './admin-corporate-actions.controller';
import { CorporateActionsController } from './corporate-actions.controller';
import { CorporateActionsService } from './corporate-actions.service';

@Module({
  imports: [PrismaModule],
  controllers: [CorporateActionsController, AdminCorporateActionsController],
  providers: [CorporateActionsService, CorporateActionSyncService],
})
export class CorporateActionsModule {}
