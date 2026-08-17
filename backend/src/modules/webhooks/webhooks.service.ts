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

  async processEasebuzzEasycollectMandateWebhook(payload: any, ipAddress: string, userAgent: string) {
    return this.loanService.handleEasebuzzEasycollectMandateWebhook(payload, { ipAddress, userAgent });
  }

  async processEasebuzzMandateWebhook(payload: any, ipAddress: string, userAgent: string) {
    return this.loanService.handleEasebuzzMandateWebhook(payload, { ipAddress, userAgent });
  }

  async processDisbursalWebhook(lenderCode: string, payload: any, ipAddress: string, userAgent: string) {
    return this.loanService.processDisbursalWebhook(lenderCode, payload, ipAddress, userAgent);
  }

  async processRepaymentWebhook(payload: any) {
    const lan = payload.lan || payload.LAN || payload.loanAccountNo;
    return this.loanService.processRepayment(lan, payload);
  }

  async processEasebuzzPaymentWebhook(payload: any) {
    const udf3 = String(payload?.udf3 || payload?.purpose || '').trim().toUpperCase();
    const status = String(payload?.status || payload?.payment_status || '').toLowerCase();
    const isSuccess = ['success', 'successful', 'paid', 'captured', 'completed'].includes(status);

    if (!isSuccess) {
      return { success: false, status: 'IGNORED', message: 'Payment status is not successful' };
    }

    if (udf3 === 'EMI_REPAYMENT' || udf3 === 'REPAYMENT') {
      const lan = payload?.udf4 || payload?.lan || payload?.loanAccountNo;
      const instNum = Number(payload?.udf5 || payload?.installmentNumber || 1);
      const amount = Number(payload?.amount);
      const paymentId = payload?.txnid || payload?.easepayid;

      return this.loanService.processRepayment(lan, {
        installmentNumber: instNum,
        amount,
        paymentId,
        paymentMode: 'EASEBUZZ',
        referenceNumber: payload?.easepayid || payload?.txnid,
      });
    }

    return { success: true, message: 'Easebuzz payment webhook acknowledged' };
  }
}
