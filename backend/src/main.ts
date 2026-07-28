import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import * as express from 'express';
import { join } from 'path';
import { AppModule } from './app.module';
import { Logger } from "@nestjs/common";


const cookieParser = require('cookie-parser');
const helmet = require('helmet');

async function bootstrap(): Promise<void> {
  
  const app = await NestFactory.create(AppModule, { bodyParser: false, bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = new Logger("UserService");
  app.useLogger(logger);
  app.use(helmet());
  app.use(cookieParser());
  app.use(json({ limit: config.getOrThrow<string>('REQUEST_BODY_LIMIT') }));
  app.use(urlencoded({ extended: false, limit: config.getOrThrow<string>('REQUEST_BODY_LIMIT') }));
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));
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
