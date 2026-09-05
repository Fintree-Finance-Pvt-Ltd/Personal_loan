import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../infrastructure/prisma/prisma.module';
import { UnaportTokenService } from './unaport-token.service';
import { UnaportService } from './unaport.service';
import { UnaportController } from './unaport.controller';
import { UnaportWebhookController } from './unaport-webhook.controller';
import { LenderIntegrationModule } from '../../lender-integrations/lender-integration.module';
import { BoostMoneyBsaService } from '../../../integrations/boost-money-bsa.service';

@Module({
  // For LenderIntegrationOutboxService, to record the AA consent as journey evidence.
  imports: [ConfigModule, PrismaModule, LenderIntegrationModule],
  controllers: [UnaportController, UnaportWebhookController],
  providers: [UnaportTokenService, UnaportService, BoostMoneyBsaService],
  exports: [UnaportTokenService, UnaportService, BoostMoneyBsaService],
})
export class UnaportModule {}

