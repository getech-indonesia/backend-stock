import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';

import { AdminAuth } from '../../common/decorators/admin-auth.decorator';
import { ShareholdingsService } from './shareholdings.service';

@Controller('admin/shareholdings')
@AdminAuth()
export class ShareholdingsController {
  constructor(private readonly shareholdingsService: ShareholdingsService) {}

  @Get('company/:companyId')
  async getShareholdingsByCompany(@Param('companyId') companyId: string) {
    return this.shareholdingsService.findAllByCompanyAdmin(companyId);
  }

  @Get(':id')
  async getShareholding(@Param('id') id: string) {
    return this.shareholdingsService.findOneAdmin(id);
  }

  @Post()
  async createShareholding(@Body() body: unknown) {
    return this.shareholdingsService.createAdmin(body);
  }

  @Patch(':id')
  async updateShareholding(@Param('id') id: string, @Body() body: unknown) {
    return this.shareholdingsService.updateAdmin(id, body);
  }

  @Delete(':id')
  async deleteShareholding(@Param('id') id: string) {
    return this.shareholdingsService.deleteAdmin(id);
  }
}
