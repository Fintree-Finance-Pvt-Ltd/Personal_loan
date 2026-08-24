import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import { IvrService } from './ivr.service';

@Controller()
export class IvrWebhookController {
  constructor(private readonly ivrService: IvrService) {}

  /**
   * Unified IVR Webhook endpoint (receives Call Lifecycle and Analytics events).
   * Route: POST /api/ivr/webhook
   */
  @Public()
  @Post('ivr/webhook')
  @HttpCode(HttpStatus.OK)
  async handleUnifiedWebhook(@Body() payload: any) {
    return this.ivrService.handleWebhook(payload, 'unified');
  }

  /**
   * Call Lifecycle Events Webhook endpoint (started, completed, status update).
   * Route: POST /api/ivr/lifecycle
   */
  @Public()
  @Post('ivr/lifecycle')
  @HttpCode(HttpStatus.OK)
  async handleLifecycleWebhook(@Body() payload: any) {
    return this.ivrService.handleWebhook(payload, 'lifecycle');
  }

  /**
   * Analytics Events Webhook endpoint (analytics_completed).
   * Route: POST /api/ivr/analytics
   */
  @Public()
  @Post('ivr/analytics')
  @HttpCode(HttpStatus.OK)
  async handleAnalyticsWebhook(@Body() payload: any) {
    return this.ivrService.handleWebhook(payload, 'analytics');
  }

  /**
   * Alias for Voice Agent Lifecycle webhook (matching PDF docs).
   * Route: POST /api/webhooks/voice-agent
   */
  @Public()
  @Post('webhooks/voice-agent')
  @HttpCode(HttpStatus.OK)
  async handleVoiceAgentWebhook(@Body() payload: any) {
    return this.ivrService.handleWebhook(payload, 'lifecycle');
  }

  /**
   * Alias for Analytics webhook (matching PDF docs).
   * Route: POST /api/webhooks/analytics
   */
  @Public()
  @Post('webhooks/analytics')
  @HttpCode(HttpStatus.OK)
  async handleVoiceAgentAnalyticsWebhook(@Body() payload: any) {
    return this.ivrService.handleWebhook(payload, 'analytics');
  }
}
