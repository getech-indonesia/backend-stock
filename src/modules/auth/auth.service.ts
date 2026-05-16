import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { StringValue } from 'ms';
import { JwtService } from '@nestjs/jwt';

import { PrismaService } from '../../prisma/prisma.service';

import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

import {
  compareData,
  hashData,
} from './utils/hash.util';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) { }

  async register(dto: RegisterDto) {
    const userExist = await this.prisma.user.findUnique({
      where: {
        email: dto.email,
      },
    });

    if (userExist) {
      throw new BadRequestException(
        'Email already exists',
      );
    }

    const hashedPassword = await hashData(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        fullName: dto.fullName,
      },
    });

    const tokens = await this.generateTokens(
      user.id,
      user.email,
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
      tokens
    };
  }

  async login(dto: LoginDto) {
    const user =
      await this.prisma.user.findUnique({
        where: {
          email: dto.email,
        },
      });

    if (!user) {
      throw new UnauthorizedException(
        'Invalid credentials',
      );
    }

    const passwordMatch =
      await compareData(
        dto.password,
        user.password,
      );

    if (!passwordMatch) {
      throw new UnauthorizedException(
        'Invalid credentials',
      );
    }

    const tokens =
      await this.generateTokens(
        user.id,
        user.email,
      );

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
      tokens,
    };
  }

  async generateTokens(
    userId: string,
    email: string,
  ) {
    const payload = {
      sub: userId,
      email,
    };

    const accessToken =
      await this.jwtService.signAsync(payload, {
        secret: process.env.JWT_ACCESS_SECRET as string,
        expiresIn:
          process.env.JWT_ACCESS_EXPIRES as StringValue,
      });

    const refreshToken =
      await this.jwtService.signAsync(payload, {
        secret: process.env.JWT_REFRESH_SECRET as string,
        expiresIn:
          process.env.JWT_REFRESH_EXPIRES as StringValue,
      });

    await this.updateRefreshToken(
      userId,
      refreshToken,
    );

    return {
      accessToken,
      refreshToken,
    };
  }

  async updateRefreshToken(
    userId: string,
    refreshToken: string,
  ) {
    const hashedRefreshToken =
      await hashData(refreshToken);

    await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        refreshToken: hashedRefreshToken,
      },
    });
  }
}