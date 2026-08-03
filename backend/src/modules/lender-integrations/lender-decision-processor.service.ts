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

      const existing = link.normalizedDecision;
      const terminal = existing === 'APPROVED' || existing === 'REJECTED';
      if (terminal) {
        await this.completeEvent(tx, eventId, lockToken);
        return;
      }

      const decidedAt = new Date();
      if (result.decision === 'APPROVED') {
        if (!result.approvedAmount || !result.approvedTenure || !result.approvedRoi) throw new LenderIntegrationError('LENDER_APPROVAL_TERMS_MISSING', 'Approved amount, tenure and ROI are required for an approved decision.', 'PERMANENT_VALIDATION');
        await tx.lenderApplicationLink.update({ where: { id: link.id }, data: { normalizedDecision: 'APPROVED', decisionStatus: 'COMPLETED', lastSyncedStage: event.integrationStage, lastResponseStatus: result.providerStatus, lastSuccessAt: decidedAt, lastErrorCode: null, lastErrorMessage: null, rejectionReasonCode: null } });
        await tx.plApplication.update({ where: { id: application.id }, data: { status: 'LENDER_APPROVED', lenderDecisionReference: result.decisionReference, lenderDecisionAt: decidedAt, lenderApprovedAmount: new Prisma.Decimal(result.approvedAmount), lenderApprovedTenure: result.approvedTenure, lenderApprovedRoi: new Prisma.Decimal(result.approvedRoi), lenderDecisionReason: null, lenderCoolingOffDays: null, lenderCoolingOffUntil: null, lenderNextStatusCheckAt: null } });
        await tx.customer.update({ where: { id: application.customerId }, data: { onboardingStatus: 'LENDER_APPROVED', lastActivityAt: decidedAt } });
        await tx.plLoan.upsert({
          where: { applicationId: application.id },
          create: { lan: this.generateLan(), customerId: application.customerId, applicationId: application.id, lenderCode: application.lenderCode || application.lenderId || 'LENDER', status: 'LENDER_APPROVED', currentStep: 'APPROVAL_SUMMARY', approvedAmount: new Prisma.Decimal(result.approvedAmount), lenderApprovedAt: decidedAt, offerStatus: 'AVAILABLE', offerAllowedTenures: JSON.stringify([result.approvedTenure]), offerValidUntil: new Date(decidedAt.getTime() + 30 * 24 * 60 * 60 * 1000) },
          update: {},
        });
      } else if (result.decision === 'REJECTED') {
        const coolingOffDays = Math.max(0, result.coolingOffDays ?? 0);
        const coolingOffUntil = coolingOffDays ? new Date(decidedAt.getTime() + coolingOffDays * 24 * 60 * 60 * 1000) : null;
        await tx.lenderApplicationLink.update({ where: { id: link.id }, data: { normalizedDecision: 'REJECTED', decisionStatus: 'COMPLETED', lastSyncedStage: event.integrationStage, lastResponseStatus: result.providerStatus, lastSuccessAt: decidedAt, lastErrorCode: null, lastErrorMessage: null, rejectionReasonCode: result.rejectionReasonCode?.slice(0, 100) || 'LENDER_CRITERIA_NOT_MET' } });
        await tx.plApplication.update({ where: { id: application.id }, data: { status: 'LENDER_REJECTED', lenderDecisionReference: result.decisionReference, lenderDecisionAt: decidedAt, lenderDecisionReason: 'Application did not meet lender criteria.', lenderCoolingOffDays: coolingOffDays, lenderCoolingOffUntil: coolingOffUntil, lenderNextStatusCheckAt: null } });
        await tx.customer.update({ where: { id: application.customerId }, data: { onboardingStatus: 'LENDER_REJECTED', lastActivityAt: decidedAt } });
      } else if (result.decision === 'PENDING') {
        const nextStatusCheckAt = result.nextStatusCheckAt ? new Date(result.nextStatusCheckAt) : new Date(decidedAt.getTime() + 5 * 60 * 1000);
        if (Number.isNaN(nextStatusCheckAt.getTime())) throw new LenderIntegrationError('LENDER_PENDING_DATE_INVALID', 'Lender pending response contained an invalid next status time.', 'PERMANENT_VALIDATION');
        await tx.lenderApplicationLink.update({ where: { id: link.id }, data: { normalizedDecision: 'PENDING', decisionStatus: 'ACKNOWLEDGED', lastSyncedStage: event.integrationStage, lastResponseStatus: result.providerStatus, lastSuccessAt: decidedAt, lastErrorCode: null, lastErrorMessage: null } });
        await tx.plApplication.update({ where: { id: application.id }, data: { status: 'LENDER_REVIEW', lenderDecisionReference: result.decisionReference, lenderDecisionAt: decidedAt, lenderNextStatusCheckAt: nextStatusCheckAt } });
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

  private generateLan(): string {
    return `LAN${new Date().toISOString().slice(2, 10).replace(/-/g, '')}${randomBytes(5).toString('hex').toUpperCase()}`;
  }
}
