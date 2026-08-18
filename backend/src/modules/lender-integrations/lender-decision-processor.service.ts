import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { LenderIntegrationError } from './lender-integration.errors';
import { LenderDecisionResult } from './lender-integration.types';

@Injectable()
export class LenderDecisionProcessor {
  constructor(private readonly prisma: PrismaService) {}

  async process(eventId: string, lockToken: string, partnerApplicationId: string, result: LenderDecisionResult): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const event = await tx.lenderIntegrationOutbox.findFirst({ where: { id: eventId, status: 'PROCESSING', lockToken } });
      if (!event) throw new LenderIntegrationError('LENDER_EVENT_LEASE_LOST', 'Lender event lease is no longer owned by this worker.', 'TEMPORARY', true);
      const application = await tx.plApplication.findUnique({ where: { id: event.applicationId }, include: { lenderApplicationLink: true } });
      const link = application?.lenderApplicationLink;
      if (!application || !link || link.partnerApplicationId !== partnerApplicationId) throw new LenderIntegrationError('LENDER_DECISION_REFERENCE_MISMATCH', 'Lender decision does not match the persisted partner application.', 'PERMANENT_VALIDATION');

      // Which of the two lender decision calls this result belongs to: V1 is the
      // pre-approval/BRE+bureau call, V2+ is the final credit-approval call made
      // after the customer has selected an offer. link.decisionPayloadVersion (not
      // event.payloadVersion) is the source of truth here since a STATUS-stage poll
      // chasing this same decision carries its own, independent version sequence.
      const isFinal = (link.decisionPayloadVersion ?? 1) >= 2;

      const alreadyResolved = isFinal
        ? application.status === 'PENDING_CREDIT_REVIEW' || application.status === 'LENDER_APPROVED' || application.status === 'LENDER_REJECTED' || application.status === 'LOAN_CLOSED'
        : application.status === 'LENDER_PRE_APPROVED' || application.status === 'LENDER_REJECTED';
      if (alreadyResolved) {
        await this.completeEvent(tx, eventId, lockToken);
        return;
      }

      const decidedAt = new Date();
      if (result.decision === 'APPROVED' && !isFinal) {
        // Pre-approval (BRE/bureau) result: persist the lender's credit limit only.
        // Do NOT create a PlLoan or open the bank/mandate journey at this stage — the
        // customer still has to select an offer, which triggers the final decision call.
        if (!result.approvedAmount) throw new LenderIntegrationError('LENDER_APPROVAL_TERMS_MISSING', 'An approved credit limit is required for a pre-approval decision.', 'PERMANENT_VALIDATION');
        await tx.lenderApplicationLink.update({ where: { id: link.id }, data: { normalizedDecision: 'APPROVED', decisionStatus: 'COMPLETED', lastSyncedStage: event.integrationStage, lastResponseStatus: result.providerStatus, lastSuccessAt: decidedAt, lastErrorCode: null, lastErrorMessage: null, rejectionReasonCode: null } });
        await tx.plApplication.update({ where: { id: application.id }, data: { status: 'LENDER_PRE_APPROVED', lenderDecisionReference: result.decisionReference, lenderDecisionAt: decidedAt, lenderApprovedAmount: new Prisma.Decimal(result.approvedAmount), lenderDecisionReason: null, lenderCoolingOffDays: null, lenderCoolingOffUntil: null, lenderNextStatusCheckAt: null } });
        await tx.customer.update({ where: { id: application.customerId }, data: { onboardingStatus: 'LENDER_PRE_APPROVED', lastActivityAt: decidedAt } });
      } else if (result.decision === 'APPROVED' && isFinal) {
        // The lender has approved the final request, but this must NOT be customer-visible
        // yet: park the application in internal credit review instead of finalizing it here.
        // Only CreditReviewService.approve() creates the PlLoan (using the customer's
        // already-selected amount/tenure and the application's existing platform LAN) —
        // this mirrors the original single-call gate, just applied to the final decision.
        let approvedRoi = result.approvedRoi;
        if (!approvedRoi && application.productStrategyVersionId) {
          const productVersion = await tx.lenderProductVersion.findUnique({
            where: { id: application.productStrategyVersionId },
            select: { annualRoiPercent: true },
          });
          if (productVersion) approvedRoi = productVersion.annualRoiPercent.toString();
        }
        if (!application.selectedAmount || !application.selectedTenure) throw new LenderIntegrationError('LENDER_APPROVAL_TERMS_MISSING', 'A customer-selected amount and tenure are required before finalizing approval.', 'PERMANENT_VALIDATION');
        await tx.lenderApplicationLink.update({ where: { id: link.id }, data: { normalizedDecision: 'APPROVED', decisionStatus: 'COMPLETED', lastSyncedStage: event.integrationStage, lastResponseStatus: result.providerStatus, lastSuccessAt: decidedAt, lastErrorCode: null, lastErrorMessage: null, rejectionReasonCode: null } });
        await tx.plApplication.update({ where: { id: application.id }, data: { status: 'PENDING_CREDIT_REVIEW', lenderDecisionReference: result.decisionReference, lenderDecisionAt: decidedAt, lenderApprovedRoi: approvedRoi ? new Prisma.Decimal(approvedRoi) : undefined, lenderDecisionReason: null } });
        await tx.customer.update({ where: { id: application.customerId }, data: { onboardingStatus: 'PENDING_CREDIT_REVIEW', lastActivityAt: decidedAt } });
      } else if (result.decision === 'REJECTED') {
        // A rejection is terminal at either stage — no PlLoan, no bank/mandate journey.
        const coolingOffDays = Math.max(0, result.coolingOffDays ?? 0);
        const coolingOffUntil = coolingOffDays ? new Date(decidedAt.getTime() + coolingOffDays * 24 * 60 * 60 * 1000) : null;
        await tx.lenderApplicationLink.update({ where: { id: link.id }, data: { normalizedDecision: 'REJECTED', decisionStatus: 'COMPLETED', lastSyncedStage: event.integrationStage, lastResponseStatus: result.providerStatus, lastSuccessAt: decidedAt, lastErrorCode: null, lastErrorMessage: null, rejectionReasonCode: result.rejectionReasonCode?.slice(0, 100) || 'LENDER_CRITERIA_NOT_MET' } });
        await tx.plApplication.update({ where: { id: application.id }, data: { status: 'LENDER_REJECTED', lenderDecisionReference: result.decisionReference, lenderDecisionAt: decidedAt, lenderDecisionReason: 'Application did not meet lender criteria.', lenderCoolingOffDays: coolingOffDays, lenderCoolingOffUntil: coolingOffUntil, lenderNextStatusCheckAt: null } });
        await tx.customer.update({ where: { id: application.customerId }, data: { onboardingStatus: 'LENDER_REJECTED', lastActivityAt: decidedAt } });
      } else if (result.decision === 'PENDING') {
        const nextStatusCheckAt = result.nextStatusCheckAt ? new Date(result.nextStatusCheckAt) : new Date(decidedAt.getTime() + 5 * 60 * 1000);
        if (Number.isNaN(nextStatusCheckAt.getTime())) throw new LenderIntegrationError('LENDER_PENDING_DATE_INVALID', 'Lender pending response contained an invalid next status time.', 'PERMANENT_VALIDATION');
        await tx.lenderApplicationLink.update({ where: { id: link.id }, data: { normalizedDecision: 'PENDING', decisionStatus: 'ACKNOWLEDGED', lastSyncedStage: event.integrationStage, lastResponseStatus: result.providerStatus, lastSuccessAt: decidedAt, lastErrorCode: null, lastErrorMessage: null } });
        // Pre-approval pending shows the generic "processing" screen via LENDER_REVIEW.
        // Final-approval pending leaves application.status alone (stays LENDER_PRE_APPROVED
        // with selectedAmount/selectedTenure already set) — nextPermittedStep uses the
        // presence of a selected offer to show "processing" instead of the offer picker.
        if (!isFinal) {
          await tx.plApplication.update({ where: { id: application.id }, data: { status: 'LENDER_REVIEW', lenderDecisionReference: result.decisionReference, lenderDecisionAt: decidedAt, lenderNextStatusCheckAt: nextStatusCheckAt } });
        } else {
          await tx.plApplication.update({ where: { id: application.id }, data: { lenderDecisionReference: result.decisionReference, lenderDecisionAt: decidedAt, lenderNextStatusCheckAt: nextStatusCheckAt } });
        }
        const nextVersion = event.integrationStage === 'STATUS' ? event.payloadVersion + 1 : 1;
        if (nextVersion <= 5) {
          const idempotencyKey = `${application.applicationNumber}:LENDER_STATUS_CHECK:V${nextVersion}`;
          await tx.lenderIntegrationOutbox.upsert({ where: { idempotencyKey }, create: { eventType: 'LENDER_STATUS_CHECK', applicationId: application.id, applicationReference: application.applicationNumber, lenderId: application.lenderId!, integrationStage: 'STATUS', payloadVersion: nextVersion, idempotencyKey, availableAt: nextStatusCheckAt }, update: {} });
        }
      } else {
        throw new LenderIntegrationError('LENDER_DECISION_UNSUPPORTED', 'Lender decision was not APPROVED, REJECTED or PENDING.', 'PERMANENT_VALIDATION');
      }
      await this.completeEvent(tx, eventId, lockToken);
    });
  }

  private async completeEvent(tx: Prisma.TransactionClient, eventId: string, lockToken: string) {
    const completed = await tx.lenderIntegrationOutbox.updateMany({ where: { id: eventId, status: 'PROCESSING', lockToken }, data: { status: 'COMPLETED', processedAt: new Date(), lockedAt: null, lockedBy: null, lockToken: null, leaseExpiresAt: null, lastErrorCode: null, lastErrorMessage: null } });
    if (completed.count !== 1) throw new LenderIntegrationError('LENDER_EVENT_LEASE_LOST', 'Lender event lease was lost before decision completion.', 'TEMPORARY', true);
  }


}
