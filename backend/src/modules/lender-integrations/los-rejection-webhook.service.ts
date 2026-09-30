import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export interface SendRejectionWebhookParams {
  lan: string;
  reason: string;
  lenderId?: string;
  applicationId?: bigint;
}

export interface LosRejectionWebhookPayload {
  lan: string;
  status: 'REJECTED';
  stage: 'LOS_REJECTED';
  message: string;
  reject_reason: string;
  timestamp: string;
}

@Injectable()
export class LosRejectionWebhookService {
  private readonly logger = new Logger(LosRejectionWebhookService.name);
  private readonly sentLanRejections = new Set<string>();

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async sendRejectionWebhook(params: SendRejectionWebhookParams): Promise<boolean> {
    const { lan, reason, lenderId, applicationId } = params;

    if (!lan) {
      this.logger.warn('[LOS REJECTION WEBHOOK] Skipping webhook dispatch: LAN is missing.');
      return false;
    }

    // Idempotency: Do not send duplicate rejection events for the same rejection
    if (this.sentLanRejections.has(lan)) {
      this.logger.log(`[LOS REJECTION WEBHOOK] LAN ${lan} has already received rejection webhook. Skipping duplicate.`);
      return true;
    }

    const payload: LosRejectionWebhookPayload = {
      lan,
      status: 'REJECTED',
      stage: 'LOS_REJECTED',
      message: 'Loan application rejected',
      reject_reason: reason,
      timestamp: new Date().toISOString(),
    };

    // Exact logging format required by LOS specification
    this.logger.log(
      `[LOS REJECTION WEBHOOK]\nLAN: ${lan}\nStatus: REJECTED\nStage: LOS_REJECTED\nReason: ${reason}`,
    );

    const { url, headers } = await this.resolveWebhookEndpoint(lan, lenderId, applicationId);

    const maxRetries = 3;
    let attempt = 0;
    let success = false;
    let lastError: any = null;

    while (attempt < maxRetries && !success) {
      attempt++;
      try {
        const response = await firstValueFrom(
          this.http.post(url, payload, {
            headers,
            timeout: 10000,
          }),
        );

        if (response.status >= 200 && response.status < 300) {
          success = true;
          this.sentLanRejections.add(lan);
          this.logger.log('[LOS REJECTION WEBHOOK] Sent successfully');
          return true;
        } else {
          throw new Error(`Received unexpected HTTP status ${response.status}`);
        }
      } catch (err: any) {
        lastError = err;
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        }
      }
    }

    this.logger.error('[LOS REJECTION WEBHOOK] Failed');
    if (lastError) {
      this.logger.warn(`[LOS REJECTION WEBHOOK] Delivery error details: ${lastError?.message || lastError}`);
    }

    // Webhook failure never throws or changes the loan back to another status
    return false;
  }

  private async resolveWebhookEndpoint(lan: string, lenderId?: string, applicationId?: bigint) {
    const correlationId = randomUUID();
    const idempotencyKey = `${lan}:LOS_REJECTED`;

    // 1. Resolve via explicit environment variables if configured
    const envUrl =
      this.config.get<string>('LMS_REJECTION_WEBHOOK_URL') ||
      this.config.get<string>('LMS_WEBHOOK_URL');

    if (envUrl) {
      const apiKey =
        this.config.get<string>('FINTREE_API_KEY') ||
        this.config.get<string>('LMS_API_KEY') ||
        'Fintree@2026';

      return {
        url: envUrl,
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-Id': correlationId,
          'Idempotency-Key': idempotencyKey,
          'x-api-key': apiKey,
        },
      };
    }

    // 2. Resolve via LenderIntegrationConfig in database
    let config = null;
    if (lenderId) {
      config = await this.prisma.lenderIntegrationConfig.findFirst({
        where: { lenderId, isActive: true },
      });
    }

    if (!config && applicationId) {
      const app = await this.prisma.plApplication.findUnique({
        where: { id: applicationId },
        select: { lenderId: true },
      });
      if (app?.lenderId) {
        config = await this.prisma.lenderIntegrationConfig.findFirst({
          where: { lenderId: app.lenderId, isActive: true },
        });
      }
    }

    if (!config) {
      config = await this.prisma.lenderIntegrationConfig.findFirst({
        where: { isActive: true },
      });
    }

    const baseUrl = config?.baseUrl?.replace(/\/+$/, '') || 'https://finle-uat.fintreelms.com';
    const webhookPath = (config?.webhookPath || '/api/partner/v1/webhook').replace(/^\/+/, '');
    const url = `${baseUrl}/${webhookPath}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Correlation-Id': correlationId,
      'Idempotency-Key': idempotencyKey,
    };

    if (config?.authType === 'BEARER_TOKEN') {
      const secret = config.credentialSecretReference
        ? this.config.get<string>(config.credentialSecretReference)
        : null;
      if (secret) {
        headers['Authorization'] = `Bearer ${secret}`;
      }
    } else {
      const secretRef = config?.credentialSecretReference || 'FINTREE_API_KEY';
      const apiKey = this.config.get<string>(secretRef) || 'Fintree@2026';
      headers['x-api-key'] = apiKey;
    }

    return { url, headers };
  }
}
