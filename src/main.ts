import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';

function parseCorsOrigins(value?: string): string[] {
  const fallbackOrigins = ['http://localhost:3000'];
  const normalized = value?.trim();

  if (!normalized) {
    return fallbackOrigins;
  }

  if (normalized.startsWith('[')) {
    try {
      const parsed = JSON.parse(normalized);

      if (Array.isArray(parsed)) {
        return parsed
          .filter((origin): origin is string => typeof origin === 'string')
          .map((origin) => origin.trim())
          .filter(Boolean);
      }
    } catch {
      return fallbackOrigins;
    }
  }

  return normalized
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const corsOrigins = parseCorsOrigins(process.env.FRONTEND_ORIGIN);

  app.setGlobalPrefix('api/v1');

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.use(cookieParser());

  await app.listen(8080);
}

bootstrap();
