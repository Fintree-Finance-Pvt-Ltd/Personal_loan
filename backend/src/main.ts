import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import * as express from 'express';
import { join } from 'path';
import { AppModule } from './app.module';
import { Logger } from "@nestjs/common";

// Enable JSON.stringify serialization for BigInt values returned by Prisma
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};


const cookieParser = require('cookie-parser');
const helmet = require('helmet');

async function bootstrap(): Promise<void> {

  const app = await NestFactory.create(AppModule, { bodyParser: false, bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = new Logger("UserService");
  app.useLogger(logger);
  app.use(cookieParser());
  app.use(
    helmet({
      crossOriginResourcePolicy: false,
    }),
  );
  app.use(json({ 
    limit: config.getOrThrow<string>('REQUEST_BODY_LIMIT'),
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    }
  }));
  app.use(urlencoded({ extended: false, limit: config.getOrThrow<string>('REQUEST_BODY_LIMIT') }));
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));
  app.setGlobalPrefix(config.getOrThrow<string>('API_PREFIX'));
  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'PATCH', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'Accept', 'Origin', 'Idempotency-Key', 'X-Client-Id', 'X-Request-Timestamp', 'X-Nonce', 'X-Signature'],
    exposedHeaders: ['X-Request-ID'],
  });
  const adapter = app.getHttpAdapter().getInstance();
  const trustProxy = config.get<boolean>('TRUST_PROXY');
  if (trustProxy) {
    adapter.set('trust proxy', 1);
  }
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
