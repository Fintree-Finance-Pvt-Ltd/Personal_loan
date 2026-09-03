import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../infrastructure/prisma/prisma.module';
import { UnaportTokenService } from './unaport-token.service';
import { UnaportService } from './unaport.service';
import { UnaportController } from './unaport.controller';
import { UnaportWebhookController } from './unaport-webhook.controller';
import { LenderIntegrationModule } from '../../lender-integrations/lender-integration.module';

@Module({
  // For LenderIntegrationOutboxService, to record the AA consent as journey evidence.
  imports: [ConfigModule, PrismaModule, LenderIntegrationModule],
  controllers: [UnaportController, UnaportWebhookController],
  providers: [UnaportTokenService, UnaportService],
  exports: [UnaportTokenService, UnaportService],
})
export class UnaportModule {}
