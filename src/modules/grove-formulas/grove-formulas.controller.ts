import { Controller, Get, Param, Query } from '@nestjs/common';

import { AdminAuth } from '../../common/decorators/admin-auth.decorator';
import { GroveFormulasService } from './grove-formulas.service';
import { AdminGroveFormulasQueryDto } from './dto/admin-grove-formulas-query.dto';

@Controller('admin/grove-formulas')
@AdminAuth()
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
