import { Controller, Get, Query } from '@nestjs/common';
import { AdminCompaniesQueryDto } from './dto/admin-companies-query.dto';
import { CompaniesService } from './companies.service';

@Controller('admin/companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  async getAllCompanies(@Query() query: AdminCompaniesQueryDto) {
    return this.companiesService.findAllAdmin(query);
  }

  @Get('search')
  async searchCompanies(@Query() query: AdminCompaniesQueryDto) {
    return this.companiesService.searchAdminCompanies(query);
  }
}
