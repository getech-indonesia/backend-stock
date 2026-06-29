import { Controller, Get, Query } from '@nestjs/common';

import { AdminAuth } from '../../common/decorators/admin-auth.decorator';
import { AdminCompaniesQueryDto } from './dto/admin-companies-query.dto';
import { CompaniesService } from './companies.service';

@Controller('admin/companies')
@AdminAuth()
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  async getAllCompanies(@Query() query: AdminCompaniesQueryDto) {
    return this.companiesService.findAllAdmin(query);
  }
}
