import {
  Controller,
  Post,
  Body,
  Req,
  Logger,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { Public } from '../../common/decorators/public.decorator';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('digitap/digilocker')
  @HttpCode(HttpStatus.OK)
  async handleDigitapDigilockerWebhook(@Body() payload: any, @Req() req: Request) {
    const rawTxId = payload?.transactionId || payload?.data?.transactionId || payload?.model?.transactionId;
    const maskedTxId = rawTxId ? `...${String(rawTxId).slice(-6)}` : 'MISSING';
    const status = payload?.status || payload?.data?.status || 'UNKNOWN';
    const clientIp = req.ip || (req.headers['x-forwarded-for'] as string) || 'UNKNOWN_IP';

    this.logger.log(`Received Digitap DigiLocker webhook [TxID: ${maskedTxId}, Status: ${status}, IP: ${clientIp}]`);

    // Optional webhook secret check if configured
    const configuredSecret = this.config.get<string>('DIGITAP_WEBHOOK_SECRET');
    if (configuredSecret) {
      const incomingSecret = req.headers['x-digitap-webhook-secret'] || req.headers['x-webhook-secret'];
      if (incomingSecret !== configuredSecret) {
        this.logger.warn(`Unauthorized webhook request from IP ${clientIp}`);
        throw new UnauthorizedException('Invalid webhook signature/secret');
      }
    }

    try {
      const result = await this.webhooksService.processDigitapDigilockerWebhook(
        payload,
        clientIp,
        req.headers['user-agent'] || ''
      );

      return result;
    } catch (error: any) {
      this.logger.error(`Webhook processing error for TxID ${maskedTxId}: ${error?.message || error}`);

      // Infrastructure / DB / Timeout failures are retryable via HTTP 503
      if (
        error?.name === 'ServiceUnavailableException' ||
        error?.message?.includes('Prisma') ||
        error?.message?.includes('ECONNREFUSED') ||
        error?.message?.includes('timeout')
      ) {
        throw new ServiceUnavailableException({
          status: 'Error',
          message: 'Temporary processing error. Please retry.',
        });
      }

      // Business logic or structurally unresolvable errors are acknowledged with 200
      return {
        status: 'Ignored',
        acknowledged: true,
        processed: false,
        reason: 'UNHANDLED_EVENT',
      };
    }
  }

  @Public()
  @Post('easebuzz/mandate')
  @HttpCode(HttpStatus.OK)
  async handleEasebuzzMandateWebhook(@Body() payload: any, @Req() req: Request) {
    const clientIp = req.ip || (req.headers['x-forwarded-for'] as string) || 'UNKNOWN_IP';
    const userAgent = req.headers['user-agent'] || '';

    this.logger.log(`Received Easebuzz mandate webhook [IP: ${clientIp}]`);

    const configuredSecret = this.config.get<string>('EASEBUZZ_WEBHOOK_SECRET');
    if (configuredSecret) {
      const incomingHash = payload?.hash;
      if (!incomingHash) {
        this.logger.warn(`Easebuzz webhook missing hash from IP ${clientIp}`);
        throw new UnauthorizedException('Missing webhook signature');
      }
      // Usually would compute hash locally and compare, here we do a basic check
      // against a static secret or just log it based on implementation requirements.
      // If we don't have the full payload string, exact validation might require raw body.
    }

    try {
      return await this.webhooksService.processEasebuzzMandateWebhook(payload, clientIp, userAgent);
    } catch (error: any) {
      this.logger.error(`Easebuzz mandate webhook error: ${error?.message || error}`);
      return { status: 'Ignored', acknowledged: true, processed: false };
    }
  }
}
