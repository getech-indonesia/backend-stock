import {
  Body,
  Controller,
  Post,
  Res,
} from '@nestjs/common';
import { type Response } from 'express';
import { AuthService } from './auth.service';

import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
  ) { }

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true })
    res: Response,
  ) {
    const result =
      await this.authService.register(dto);

    return this.handleAuthResponse(
      res,
      result,
      'Register successful',
    );
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true })
    res: Response,
  ) {
    const result =
      await this.authService.login(dto);

    return this.handleAuthResponse(
      res,
      result,
      'Login successful',
    );
  }

  private handleAuthResponse(
    res: Response,
    result: any,
    message: string,
  ) {
    res.cookie(
      'refreshToken',
      result.tokens.refreshToken,
      {
        httpOnly: true,
        secure:
          process.env.NODE_ENV ===
          'production',
        sameSite: 'strict',
        maxAge:
          7 * 24 * 60 * 60 * 1000,
      },
    );

    return {
      success: true,
      message,
      data: {
        user: result.user,
        accessToken:
          result.tokens.accessToken,
      },
    };
  }
}