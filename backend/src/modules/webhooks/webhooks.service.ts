import { Injectable, Logger } from '@nestjs/common';
import { LoanService } from '../loan/loan.service';
import { normalizeDigitapStatus } from '../loan/digilocker-normalizer';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly loanService: LoanService) {}

  async processDigitapDigilockerWebhook(payload: any, ipAddress: string, userAgent: string) {
    const transactionId =
      payload?.transactionId ||
      payload?.data?.transactionId ||
      payload?.model?.transactionId;

    if (!transactionId) {
      this.logger.warn('Received Digitap DigiLocker webhook payload missing transactionId');
      return {
        status: 'Ignored',
        acknowledged: true,
        processed: false,
        reason: 'MISSING_TRANSACTION_ID',
      };
    }

    const rawStatus =
      payload?.status ||
      payload?.data?.status ||
      payload?.model?.status ||
      payload?.code ||
      '';

    const normalizedStatus = normalizeDigitapStatus(rawStatus);

    // Delegate business processing to LoanService
    const result = await this.loanService.handleDigilockerWebhook(
      String(transactionId),
      normalizedStatus,
      payload,
      { ipAddress, userAgent }
    );

    return result;
  }

  async processEasebuzzMandateWebhook(payload: any, ipAddress: string, userAgent: string) {
    return this.loanService.handleEasebuzzMandateWebhook(payload, { ipAddress, userAgent });
  }
}
