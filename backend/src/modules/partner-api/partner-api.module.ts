// ──────────────────────────────────────────────────────────────────────────
// Partner API Module
// ──────────────────────────────────────────────────────────────────────────
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PartnerApplicationController } from './partner-application.controller';
import { PartnerApplicationService } from './partner-application.service';
import { PartnerAuthGuard } from './partner-auth.guard';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { PartnerWebhookService } from './partner-webhook.service';
import { PartnerAdminController } from './partner-admin.controller';
import { PartnerAdminService } from './partner-admin.service';

@Module({
  imports: [HttpModule.register({ maxRedirects: 0 })],
  controllers: [PartnerApplicationController, PartnerAdminController],
  providers: [
    PartnerAuthGuard,
    IdempotencyInterceptor,
    PartnerApplicationService,
    PartnerWebhookService,
    PartnerAdminService,
  ],
  exports: [PartnerApplicationService, PartnerAdminService],
})
export class PartnerApiModule {}
