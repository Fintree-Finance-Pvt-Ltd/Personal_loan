import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { LoanModule } from '../loan/loan.module';
import { ExternalApiModule } from '../external-api/external-api.module';

@Module({
  imports: [ConfigModule, LoanModule, ExternalApiModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
