import { Controller, Get, Query } from '@nestjs/common';

import { AdminAuth } from '../../common/decorators/admin-auth.decorator';
import { CorporateActionsService } from './corporate-actions.service';
import { AdminCorporateActionsQueryDto } from './dto/admin-corporate-actions-query.dto';

@Controller('admin/corporate-action')
@AdminAuth()
export class AdminCorporateActionsController {
  constructor(private readonly corporateActionsService: CorporateActionsService) {}

  @Get()
  async getCorporateActions(@Query() query: AdminCorporateActionsQueryDto) {
    return this.corporateActionsService.findAllAdmin(query);
  }
}
