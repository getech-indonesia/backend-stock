import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';

import { AdminAuth } from '../../common/decorators/admin-auth.decorator';
import { AdminSectorsQueryDto } from './dto/admin-sectors-query.dto';
import { CreateSectorDto } from './dto/create-sector.dto';
import { UpdateSectorDto } from './dto/update-sector.dto';
import { SectorsService } from './sectors.service';

@Controller('admin/sectors')
@AdminAuth()
export class SectorsController {
  constructor(private readonly sectorsService: SectorsService) {}

  @Get()
  async getAllSectors(@Query() query: AdminSectorsQueryDto) {
    return this.sectorsService.findAllAdmin(query);
  }

  @Get(':id')
  async getSector(@Param('id') id: string) {
    return this.sectorsService.findOneAdmin(id);
  }

  @Post()
  async createSector(@Body() body: CreateSectorDto) {
    return this.sectorsService.createAdmin(body);
  }

  @Patch(':id')
  async updateSector(@Param('id') id: string, @Body() body: UpdateSectorDto) {
    return this.sectorsService.updateAdmin(id, body);
  }

  @Delete(':id')
  async deleteSector(@Param('id') id: string) {
    return this.sectorsService.deleteAdmin(id);
  }
}
