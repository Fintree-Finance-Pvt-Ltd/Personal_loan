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

@Module({
  imports: [HttpModule.register({ maxRedirects: 0 })],
  controllers: [PartnerApplicationController],
  providers: [
    PartnerAuthGuard,
    IdempotencyInterceptor,
    PartnerApplicationService,
    PartnerWebhookService,
  ],
  exports: [PartnerApplicationService],
})
export class PartnerApiModule {}
