import { Module } from '@nestjs/common';
import { IvrAutomationService } from './ivr-automation.service';
import { IvrWebhookController } from './ivr-webhook.controller';
import { IvrController } from './ivr.controller';
import { IvrService } from './ivr.service';

import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [WhatsAppModule],
  controllers: [IvrController, IvrWebhookController],
  providers: [IvrService, IvrAutomationService],
  exports: [IvrService, IvrAutomationService],
})
export class IvrModule {}

