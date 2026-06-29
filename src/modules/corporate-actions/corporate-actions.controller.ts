import { Controller, Get, Post, Query } from '@nestjs/common';

import { AdminAuth } from '../../common/decorators/admin-auth.decorator';
import { CorporateActionSyncService } from '../../jobs/stock-sync/sync/corporate-action-sync.service';
import { CorporateActionsService } from './corporate-actions.service';
import { FindCorporateActionsQueryDto } from './dto/find-corporate-actions-query.dto';

@Controller('corporate-action')
export class CorporateActionsController {
  constructor(
    private readonly corporateActionsService: CorporateActionsService,
    private readonly corporateActionSyncService: CorporateActionSyncService,
  ) {}

  @Get()
  async getCorporateActions(@Query() query: FindCorporateActionsQueryDto) {
    return this.corporateActionsService.findAll(query);
  }

  @Post('sync')
  @AdminAuth()
  async syncCorporateActions() {
    return this.corporateActionSyncService.syncAllFromPython();
  }
}
