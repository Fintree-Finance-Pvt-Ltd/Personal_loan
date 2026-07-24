import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { JsonLoggerService } from './infrastructure/logging/json-logger.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false, bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = app.get(JsonLoggerService);
  app.useLogger(logger);
  app.use(helmet());
  app.use(json({ limit: config.getOrThrow<string>('REQUEST_BODY_LIMIT') }));
  app.use(urlencoded({ extended: false, limit: config.getOrThrow<string>('REQUEST_BODY_LIMIT') }));
  app.use(cookieParser());
  app.setGlobalPrefix(config.getOrThrow<string>('API_PREFIX'));
  app.enableCors({
    origin: [config.getOrThrow<string>('FRONTEND_URL')],
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'PATCH', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID'],
  });
  const adapter = app.getHttpAdapter().getInstance();
  adapter.set('trust proxy', config.getOrThrow<boolean>('TRUST_PROXY'));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.enableShutdownHooks();
  await app.listen(config.getOrThrow<number>('PORT'), '0.0.0.0');
  logger.log({ event: 'application_started', port: config.getOrThrow<number>('PORT') });
}

void bootstrap();
