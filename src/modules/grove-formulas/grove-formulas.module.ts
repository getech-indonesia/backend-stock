import { Module } from '@nestjs/common';

import { RolesGuard } from '../../common/guards/roles.guard';
import { PrismaModule } from '../../prisma/prisma.module';
import { GroveFormulasController } from './grove-formulas.controller';
import { GroveFormulasService } from './grove-formulas.service';

@Module({
  imports: [PrismaModule],
  controllers: [GroveFormulasController],
  providers: [GroveFormulasService, RolesGuard],
})
export class GroveFormulasModule {}
