import { applyDecorators, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';

import { Roles } from './roles.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

const adminRolesGuard = new RolesGuard(new Reflector());

export const AdminAuth = () =>
  applyDecorators(
    UseGuards(JwtAuthGuard, adminRolesGuard),
    Roles(Role.ADMIN),
  );
