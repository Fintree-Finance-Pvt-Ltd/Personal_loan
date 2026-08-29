import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../infrastructure/prisma/prisma.module';
import { WhatsAppAutomationService } from './whatsapp-automation.service';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';

@Module({
  imports: [PrismaModule],
  controllers: [WhatsAppController, WhatsAppWebhookController],
  providers: [WhatsAppService, WhatsAppAutomationService],
  exports: [WhatsAppService, WhatsAppAutomationService],
})
export class WhatsAppModule {}
