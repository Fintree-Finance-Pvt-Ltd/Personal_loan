import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import { UnaportService } from './unaport.service';
import {
  UnaportConsentNotificationPayload,
  UnaportDataNotificationPayload,
} from './unaport.types';

@Controller(['aa', 'integrations/unaport', 'webhooks/unaport', 'webhook/unaport', 'lms/unaport', 'lms/webhook'])
export class UnaportWebhookController {
  constructor(private readonly unaportService: UnaportService) {}

  /**
   * GET Probe endpoint to verify reachability.
   */
  @Public()
  @Get(['webhook', 'consent', 'consent-notification', 'data', 'data-notification', ''])
  @HttpCode(HttpStatus.OK)
  async handleWebhookProbe() {
    return {
      success: true,
      message: 'Unaport AA webhook endpoint is reachable. Please use POST method to send webhook payloads.',
      supportedMethods: ['POST'],
      endpoints: {
        unifiedWebhook: '/api/aa/webhook',
        consentWebhook: '/api/aa/consent',
        dataWebhook: '/api/aa/data',
      },
    };
  }

  /**
   * Dedicated Open & Public Webhook Endpoint for LMS System calling AA status / data updates.
   * Route: POST /api/aa/webhook
   */
  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleLmsAaWebhook(@Body() payload: any) {
    return this.handleGenericWebhook(payload);
  }

  @Public()
  @Post(['consent', 'consent-notification', 'webhook/consent'])
  @HttpCode(HttpStatus.OK)
  async handleConsentNotification(
    @Body() payload: UnaportConsentNotificationPayload,
  ) {
    return this.unaportService.handleConsentNotification(payload);
  }

  @Public()
  @Post(['data', 'data-notification', 'webhook/data'])
  @HttpCode(HttpStatus.OK)
  async handleDataNotification(
    @Body() payload: UnaportDataNotificationPayload,
  ) {
    return this.unaportService.handleDataNotification(payload);
  }

  /**
   * Generic auto-detect webhook endpoint callable directly from LMS or n8n.
   * Auto-routes to consent-notification or data-notification based on payload body.
   */
  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  async handleGenericWebhook(@Body() payload: any) {
    let rawPayload: any = payload;
    if (Array.isArray(rawPayload) && rawPayload.length > 0) {
      rawPayload = rawPayload[0];
    }
    if (rawPayload?.body && typeof rawPayload.body === 'object') {
      rawPayload = rawPayload.body;
    }

    if (rawPayload?.FIStatusNotification || rawPayload?.FIStatusResponse) {
      return this.unaportService.handleDataNotification(payload);
    }
    if (rawPayload?.ConsentStatusNotification) {
      return this.unaportService.handleConsentNotification(payload);
    }

    return this.unaportService.handleDataNotification(payload);
  }
}
