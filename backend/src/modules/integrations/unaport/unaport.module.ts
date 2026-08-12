import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../infrastructure/prisma/prisma.module';
import { UnaportTokenService } from './unaport-token.service';
import { UnaportService } from './unaport.service';
import { UnaportController } from './unaport.controller';
import { UnaportWebhookController } from './unaport-webhook.controller';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [UnaportController, UnaportWebhookController],
  providers: [UnaportTokenService, UnaportService],
  exports: [UnaportTokenService, UnaportService],
})
export class UnaportModule {}
