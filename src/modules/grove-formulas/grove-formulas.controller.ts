import { Controller, Get, Param, Query } from '@nestjs/common';
import { GroveFormulasService } from './grove-formulas.service';
import { AdminGroveFormulasQueryDto } from './dto/admin-grove-formulas-query.dto';

@Controller('admin/grove-formulas')
export class GroveFormulasController {
  constructor(private readonly service: GroveFormulasService) {}

  @Get()
  async getAll(@Query() query: AdminGroveFormulasQueryDto) {
    return this.service.findAllAdmin(query);
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.service.findOneAdmin(id);
  }
}
