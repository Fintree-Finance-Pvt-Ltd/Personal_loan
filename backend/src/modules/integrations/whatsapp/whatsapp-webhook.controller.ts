import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response, Request } from 'express';
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
   * Meta / Alots.io / WBBOX Webhook verification challenge endpoint.
   * Meta requires returning the EXACT plain text hub.challenge (NOT wrapped in JSON).
   */
  @Public()
  @Get(['v1/meta/webhook', 'webhooks/whatsapp', 'api/v1/meta/webhook', 'api/webhooks/whatsapp'])
  @HttpCode(HttpStatus.OK)
  verifyWebhook(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() res: Response,
  ): void {
    const configuredToken =
      this.configService.get<string>('WHATSAPP_WEBHOOK_VERIFY_TOKEN') ||
      'fintree_whatsapp_verify_token_2026';

    this.logger.log({
      event: 'whatsapp_webhook_verification_attempt',
      mode,
      hasToken: Boolean(token),
      hasChallenge: Boolean(challenge),
    });

    // Accept if mode is subscribe and token matches, or if token matches directly
    if ((mode === 'subscribe' || !mode) && token && token === configuredToken) {
      this.logger.log('WhatsApp webhook verification challenge PASSED.');
      res.status(HttpStatus.OK).type('text/plain').send(challenge || 'CHALLENGE_ACCEPTED');
      return;
    }

    this.logger.warn(
      `WhatsApp webhook verification challenge FAILED [tokenMatch=${token === configuredToken}]`,
    );
    res.status(HttpStatus.FORBIDDEN).type('text/plain').send('Invalid webhook verification token.');
  }

  /**
   * Handles incoming WhatsApp message events and status callbacks (sent, delivered, read, failed).
   * Exposed on /api/v1/meta/webhook and /api/webhooks/whatsapp.
   */
  @Public()
  @Post(['v1/meta/webhook', 'webhooks/whatsapp', 'api/v1/meta/webhook', 'api/webhooks/whatsapp'])
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() payload: any,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log({
      event: 'whatsapp_webhook_received',
      object: payload?.object,
      entryCount: payload?.entry?.length || 0,
      hasStatuses: Boolean(payload?.statuses || payload?.entry?.[0]?.changes?.[0]?.value?.statuses),
      hasMessages: Boolean(payload?.messages || payload?.entry?.[0]?.changes?.[0]?.value?.messages),
    });

    // Acknowledge Meta/Alots quickly with 200 OK
    res.status(HttpStatus.OK).type('text/plain').send('EVENT_RECEIVED');

    try {
      // 1. Standard Meta format: entry[].changes[].value
      if (Array.isArray(payload?.entry)) {
        for (const entry of payload.entry) {
          const changes = entry?.changes || [];
          for (const change of changes) {
            const value = change?.value;
            if (!value) continue;

            // Delivery / read / error status updates
            if (Array.isArray(value.statuses)) {
              for (const statusItem of value.statuses) {
                await this.processStatusItem(statusItem);
              }
            }

            // Customer incoming message
            if (Array.isArray(value.messages)) {
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
      }

      // 2. Direct flat format (if WBBOX or middleware posts flat payload)
      if (Array.isArray(payload?.statuses)) {
        for (const statusItem of payload.statuses) {
          await this.processStatusItem(statusItem);
        }
      }
    } catch (err: any) {
      this.logger.error(`Error processing WhatsApp webhook payload: ${err?.message}`, err?.stack);
    }
  }

  private async processStatusItem(statusItem: any): Promise<void> {
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
        status: rawStatus.toLowerCase() as 'sent' | 'delivered' | 'read' | 'failed',
        timestamp: statusItem?.timestamp,
        errorCode,
        errorMessage,
        rawPayload: statusItem,
      });
    }
  }
}
