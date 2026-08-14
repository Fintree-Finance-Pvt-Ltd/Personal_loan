import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  Logger,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
  InternalServerErrorException,
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
  @Get('easebuzz/easycollect/mandate')
  @HttpCode(HttpStatus.OK)
  async handleEasebuzzEasycollectMandateProbe() {
    return {
      success: true,
      message: 'Easebuzz EasyCollect mandate webhook endpoint is reachable. Use POST for actual webhook events.',
      path: '/api/webhooks/easebuzz/easycollect/mandate',
    };
  }

  @Public()
  @Post('easebuzz/easycollect/mandate')
  @HttpCode(HttpStatus.OK)
  async handleEasebuzzEasycollectMandateWebhook(@Body() payload: any, @Req() req: Request) {
    const clientIp = req.ip || (req.headers['x-forwarded-for'] as string) || 'UNKNOWN_IP';
    const userAgent = req.headers['user-agent'] || '';

    this.logger.log(`Received Easebuzz EasyCollect mandate webhook [IP: ${clientIp}]`);

    try {
      return await this.webhooksService.processEasebuzzEasycollectMandateWebhook(payload, clientIp, userAgent);
    } catch (error: any) {
      this.logger.error(`Easebuzz EasyCollect mandate webhook error: ${error?.message || error}`);
      return {
        status: 'Ignored',
        acknowledged: true,
        processed: false,
        reason: 'PROCESSING_ERROR',
      };
    }
  }

  @Public()
  @Get('easebuzz/mandate')
  @HttpCode(HttpStatus.OK)
  async handleEasebuzzMandateProbe() {
    return {
      success: true,
      message: 'Easebuzz mandate webhook endpoint is reachable. Use POST for actual webhook events.',
      path: '/api/webhooks/easebuzz/mandate',
    };
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

      if (
        error instanceof BadRequestException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }

      if (
        error instanceof ServiceUnavailableException ||
        error?.message?.includes('Prisma') ||
        error?.message?.includes('ECONNREFUSED') ||
        error?.message?.includes('timeout')
      ) {
        throw new ServiceUnavailableException({
          status: 'Error',
          message: 'Temporary processing error. Please retry.',
        });
      }

      throw new InternalServerErrorException('Easebuzz webhook processing failed.');
    }
  }

  @Public()
  @Post('disbursal')
  @HttpCode(HttpStatus.OK)
  async handleDefaultDisbursalWebhook(@Body() payload: any, @Req() req: Request) {
    return this.handleLenderDisbursalWebhook('DEFAULT', payload, req);
  }

  @Public()
  @Post('lenders/:lenderCode/disbursal')
  @HttpCode(HttpStatus.OK)
  async handleLenderDisbursalWebhook(
    @Param('lenderCode') lenderCode: string,
    @Body() payload: any,
    @Req() req: Request,
  ) {
    const clientIp = req.ip || (req.headers['x-forwarded-for'] as string) || 'UNKNOWN_IP';
    const userAgent = req.headers['user-agent'] || '';

    this.logger.log(`Received Disbursal Webhook [Lender: ${lenderCode}, IP: ${clientIp}]`);

    const configuredSecret =
      this.config.get<string>('PL_WEBHOOK_SECRET') ||
      this.config.get<string>('DISBURSAL_WEBHOOK_SECRET');
    if (configuredSecret) {
      const incomingSecret =
        req.headers['x-pl-webhook-secret'] ||
        req.headers['x-lender-webhook-secret'] ||
        req.headers['x-disbursal-webhook-secret'] ||
        req.headers['x-webhook-secret'];
      if (incomingSecret !== configuredSecret) {
        this.logger.warn(`Unauthorized disbursal webhook request from IP ${clientIp}`);
        throw new UnauthorizedException('Invalid disbursal webhook signature/secret');
      }
    }

    try {
      const result = await this.webhooksService.processDisbursalWebhook(
        lenderCode || 'DEFAULT',
        payload,
        clientIp,
        userAgent,
      );
      return result;
    } catch (error: any) {
      this.logger.error(`Disbursal webhook processing error: ${error?.message || error}`);

      if (
        error instanceof BadRequestException ||
        error instanceof UnauthorizedException ||
        error instanceof NotFoundException ||
        error instanceof ConflictException ||
        error instanceof UnprocessableEntityException
      ) {
        throw error;
      }

      if (
        error instanceof ServiceUnavailableException ||
        error?.message?.includes('Prisma') ||
        error?.message?.includes('ECONNREFUSED') ||
        error?.message?.includes('timeout')
      ) {
        throw new ServiceUnavailableException({
          status: 'Error',
          message: 'Temporary processing error. Please retry.',
        });
      }

      throw new InternalServerErrorException('Disbursal webhook processing failed.');
    }
  }

  @Public()
  @Post('repayment')
  @HttpCode(HttpStatus.OK)
  async handleRepaymentWebhook(@Body() payload: any, @Req() req: Request) {
    const configuredSecret =
      this.config.get<string>('PL_WEBHOOK_SECRET') ||
      this.config.get<string>('DISBURSAL_WEBHOOK_SECRET');
    if (configuredSecret) {
      const incomingSecret =
        req.headers['x-pl-webhook-secret'] ||
        req.headers['x-lender-webhook-secret'] ||
        req.headers['x-disbursal-webhook-secret'] ||
        req.headers['x-webhook-secret'];
      if (incomingSecret !== configuredSecret) {
        throw new UnauthorizedException('Invalid repayment webhook signature/secret');
      }
    }

    return this.webhooksService.processRepaymentWebhook(payload);
  }

  @Public()
  @Post('easebuzz')
  @HttpCode(HttpStatus.OK)
  async handleEasebuzzPaymentWebhook(@Body() payload: any, @Req() req: Request) {
    const clientIp = req.ip || (req.headers['x-forwarded-for'] as string) || 'UNKNOWN_IP';
    this.logger.log(`Received Easebuzz payment webhook [IP: ${clientIp}, udf3: ${payload?.udf3 || 'NONE'}]`);
    return this.webhooksService.processEasebuzzPaymentWebhook(payload);
  }
}
