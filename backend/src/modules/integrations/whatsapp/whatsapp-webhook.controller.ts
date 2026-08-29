import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../../common/decorators/public.decorator';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppWebhookPayload } from './whatsapp.types';

@Controller()
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly whatsappService: WhatsAppService,
  ) {}

  /**
   * Meta / Alots.io Webhook verification challenge endpoint.
   * Exposed on both /api/v1/meta/webhook and /api/webhooks/whatsapp.
   */
  @Public()
  @Get(['api/v1/meta/webhook', 'api/webhooks/whatsapp'])
  @HttpCode(HttpStatus.OK)
  verifyWebhook(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ): string {
    const configuredToken =
      this.configService.get<string>('WHATSAPP_WEBHOOK_VERIFY_TOKEN') ||
      'fintree_whatsapp_verify_token_2026';

    this.logger.log(`Received WhatsApp webhook verification attempt [mode=${mode}]`);

    if (mode === 'subscribe' && token && token === configuredToken) {
      this.logger.log('WhatsApp webhook verification challenge PASSED.');
      return challenge || 'CHALLENGE_ACCEPTED';
    }

    this.logger.warn(
      `WhatsApp webhook verification challenge FAILED [received=${token ? '***' : 'EMPTY'}]`,
    );
    throw new ForbiddenException('Invalid webhook verification token.');
  }

  /**
   * Handles incoming WhatsApp message events and status callbacks (sent, delivered, read, failed).
   * Exposed on both /api/v1/meta/webhook and /api/webhooks/whatsapp.
   */
  @Public()
  @Post(['api/v1/meta/webhook', 'api/webhooks/whatsapp'])
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() payload: WhatsAppWebhookPayload): Promise<{
    status: string;
    processed: boolean;
  }> {
    this.logger.log({
      event: 'whatsapp_webhook_received',
      object: payload?.object,
      entryCount: payload?.entry?.length || 0,
    });

    if (!payload?.entry || !Array.isArray(payload.entry)) {
      return { status: 'IGNORED_INVALID_PAYLOAD', processed: false };
    }

    for (const entry of payload.entry) {
      const changes = entry?.changes || [];
      for (const change of changes) {
        const value = change?.value;
        if (!value) continue;

        // 1. Process delivery / read / error status updates
        if (value.statuses && Array.isArray(value.statuses)) {
          for (const statusItem of value.statuses) {
            const providerMessageId = statusItem?.id;
            const rawStatus = statusItem?.status;

            if (providerMessageId && rawStatus) {
              const errorCode = statusItem?.errors?.[0]?.code?.toString();
              const errorMessage =
                statusItem?.errors?.[0]?.title ||
                statusItem?.errors?.[0]?.message ||
                statusItem?.errors?.[0]?.error_data?.details;

              await this.whatsappService.updateMessageStatus({
                providerMessageId,
                status: rawStatus as 'sent' | 'delivered' | 'read' | 'failed',
                timestamp: statusItem?.timestamp,
                errorCode,
                errorMessage,
                rawPayload: statusItem,
              });
            }
          }
        }

        // 2. Process incoming customer messages / button clicks if any
        if (value.messages && Array.isArray(value.messages)) {
          for (const message of value.messages) {
            this.logger.log({
              event: 'whatsapp_customer_message_received',
              from: message?.from,
              messageId: message?.id,
              type: message?.type,
              text: message?.text?.body || message?.button?.text || message?.interactive?.button_reply?.title,
            });
          }
        }
      }
    }

    return { status: 'SUCCESS', processed: true };
  }
}
