import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';

import { AdminAuth } from '../../common/decorators/admin-auth.decorator';
import { AdminIndustriesQueryDto } from './dto/admin-industries-query.dto';
import { CreateIndustryDto } from './dto/create-industry.dto';
import { UpdateIndustryDto } from './dto/update-industry.dto';
import { IndustriesService } from './industries.service';

@Controller('admin/industries')
@AdminAuth()
export class IndustriesController {
  constructor(private readonly industriesService: IndustriesService) {}

  @Get()
  async getAllIndustries(@Query() query: AdminIndustriesQueryDto) {
    return this.industriesService.findAllAdmin(query);
  }

  @Get(':id')
  async getIndustry(@Param('id') id: string) {
    return this.industriesService.findOneAdmin(id);
  }

  @Post()
  async createIndustry(@Body() body: CreateIndustryDto) {
    return this.industriesService.createAdmin(body);
  }

  @Patch(':id')
  async updateIndustry(@Param('id') id: string, @Body() body: UpdateIndustryDto) {
    return this.industriesService.updateAdmin(id, body);
  }

  @Delete(':id')
  async deleteIndustry(@Param('id') id: string) {
    return this.industriesService.deleteAdmin(id);
  }
}
