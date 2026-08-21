import { Injectable, Logger } from '@nestjs/common';
import { LoanService } from '../loan/loan.service';
import { PlPaymentsService } from '../external-api/pl-payments.service';
import { normalizeDigitapStatus } from '../loan/digilocker-normalizer';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly loanService: LoanService,
    private readonly plPaymentsService: PlPaymentsService,
  ) {}

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

  // NOTE: this route does NOT credit a repayment directly (VAPT C2 — it used to trust
  // lan/installmentNumber/amount straight from an unauthenticated request body with no
  // signature of any kind). It only reaches this far after the controller's mandatory
  // secret-header check has already passed.
  async processRepaymentWebhook(payload: any) {
    const lan = payload.lan || payload.LAN || payload.loanAccountNo;
    this.logger.warn(`/webhooks/repayment invoked for LAN ${lan} — this route no longer credits repayments directly; verified crediting happens via the Easebuzz webhook only.`);
    return {
      success: false,
      status: 'IGNORED',
      message: 'This endpoint no longer processes repayments directly. Repayments are credited only via the signature-verified Easebuzz webhook.',
    };
  }

  // Delegates to PlPaymentsService.handleEasebuzzWebhook — the single, properly
  // hash-verified + idempotent + amount-checked Easebuzz webhook handler already used
  // for the assessment fee. This route used to do its own thing with zero signature
  // verification (VAPT C2); it's now just an alternate URL for the same secure handler.
  async processEasebuzzPaymentWebhook(payload: any, headers: any) {
    return this.plPaymentsService.handleEasebuzzWebhook(payload, headers);
  }
}
