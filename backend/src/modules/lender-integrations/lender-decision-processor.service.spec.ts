import { Prisma } from '@prisma/client';
import { LenderDecisionProcessor } from './lender-decision-processor.service';

describe('LenderDecisionProcessor', () => {
  const base = (overrides: { applicationStatus?: string; decisionPayloadVersion?: number; selectedAmount?: any; selectedTenure?: number | null; lenderApprovedRoi?: any } = {}) => {
    const event = { id: 'EVENT-1', applicationId: 1n, integrationStage: 'DECISION', payloadVersion: overrides.decisionPayloadVersion ?? 1 };
    const link = { id: 'LINK-1', partnerApplicationId: 'PARTNER-1', decisionPayloadVersion: overrides.decisionPayloadVersion ?? 1 };
    const application = {
      id: 1n,
      customerId: 2n,
      applicationNumber: 'APP-1',
      lenderId: 'L1',
      lenderCode: 'L1',
      productStrategyVersionId: 'PSV-1',
      status: overrides.applicationStatus ?? 'ASSESSMENT_FEE_PAID',
      platformLan: 'FTPL00000001',
      selectedAmount: overrides.selectedAmount === undefined ? new Prisma.Decimal('8000') : overrides.selectedAmount,
      selectedTenure: overrides.selectedTenure === undefined ? 12 : overrides.selectedTenure,
      lenderApprovedRoi: overrides.lenderApprovedRoi === undefined ? null : overrides.lenderApprovedRoi,
      lenderApplicationLink: link,
    };
    const tx: any = {
      lenderIntegrationOutbox: {
        findFirst: jest.fn().mockResolvedValue(event),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        upsert: jest.fn().mockImplementation(({ create }: any) => create),
      },
      plApplication: { findUnique: jest.fn().mockResolvedValue(application), update: jest.fn() },
      lenderApplicationLink: { update: jest.fn() },
      customer: { update: jest.fn() },
      lenderProductVersion: { findUnique: jest.fn() },
      plLoan: { upsert: jest.fn() },
    };
    const prisma: any = { $transaction: jest.fn(async (callback: any) => callback(tx)) };
    return { processor: new LenderDecisionProcessor(prisma), tx };
  };

  describe('pre-approval (V1) decision', () => {
    it('persists an APPROVED pre-approval as LENDER_PRE_APPROVED without creating a loan', async () => {
      const { processor, tx } = base();
      await processor.process('EVENT-1', 'LOCK-1', 'PARTNER-1', {
        decision: 'APPROVED', providerStatus: 'APPROVED', decisionReference: 'DEC-1', approvedAmount: '125000',
      });

      expect(tx.plApplication.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'LENDER_PRE_APPROVED', lenderApprovedAmount: new Prisma.Decimal('125000') }),
      }));
      expect(tx.customer.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ onboardingStatus: 'LENDER_PRE_APPROVED' }),
      }));
      expect(tx.plLoan.upsert).not.toHaveBeenCalled();
    });

    it('throws when the pre-approval response has no credit limit', async () => {
      const { processor } = base();
      await expect(processor.process('EVENT-1', 'LOCK-1', 'PARTNER-1', {
        decision: 'APPROVED', providerStatus: 'APPROVED', decisionReference: 'DEC-1',
      })).rejects.toThrow('An approved credit limit is required');
    });

    it('persists a PENDING pre-approval as LENDER_REVIEW and schedules a status check', async () => {
      const { processor, tx } = base();
      await processor.process('EVENT-1', 'LOCK-1', 'PARTNER-1', {
        decision: 'PENDING', providerStatus: 'UNDER_REVIEW', decisionReference: 'DEC-3',
      });

      expect(tx.plApplication.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'LENDER_REVIEW' }),
      }));
      expect(tx.lenderIntegrationOutbox.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { idempotencyKey: 'APP-1:LENDER_STATUS_CHECK:V1' },
      }));
    });

    it('is a no-op replay once pre-approval has already resolved', async () => {
      const { processor, tx } = base({ applicationStatus: 'LENDER_PRE_APPROVED' });
      await processor.process('EVENT-1', 'LOCK-1', 'PARTNER-1', {
        decision: 'APPROVED', providerStatus: 'APPROVED', decisionReference: 'DEC-1', approvedAmount: '125000',
      });
      expect(tx.plApplication.update).not.toHaveBeenCalled();
      expect(tx.lenderIntegrationOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'EVENT-1', status: 'PROCESSING', lockToken: 'LOCK-1' },
      }));
    });
  });

  describe('final approval (V2) decision', () => {
    it('parks a final APPROVED decision in credit review instead of finalizing it — no loan is created', async () => {
      const { processor, tx } = base({ applicationStatus: 'LENDER_PRE_APPROVED', decisionPayloadVersion: 2 });
      tx.lenderProductVersion.findUnique.mockResolvedValue({ annualRoiPercent: new Prisma.Decimal('14.25') });

      await processor.process('EVENT-1', 'LOCK-1', 'PARTNER-1', {
        decision: 'APPROVED', providerStatus: 'APPROVED', decisionReference: 'DEC-2',
      });

      expect(tx.plApplication.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING_CREDIT_REVIEW', lenderApprovedRoi: new Prisma.Decimal('14.25') }),
      }));
      expect(tx.customer.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ onboardingStatus: 'PENDING_CREDIT_REVIEW' }),
      }));
      expect(tx.plLoan.upsert).not.toHaveBeenCalled();
    });

    it('throws when no offer has been selected yet', async () => {
      const { processor } = base({ applicationStatus: 'LENDER_PRE_APPROVED', decisionPayloadVersion: 2, selectedAmount: null, selectedTenure: null });
      await expect(processor.process('EVENT-1', 'LOCK-1', 'PARTNER-1', {
        decision: 'APPROVED', providerStatus: 'APPROVED', decisionReference: 'DEC-2',
      })).rejects.toThrow('selected amount and tenure');
    });

    it('leaves application.status untouched on a PENDING final result (customer already selected an offer)', async () => {
      const { processor, tx } = base({ applicationStatus: 'LENDER_PRE_APPROVED', decisionPayloadVersion: 2 });
      await processor.process('EVENT-1', 'LOCK-1', 'PARTNER-1', {
        decision: 'PENDING', providerStatus: 'PROCESSING', decisionReference: 'DEC-2',
      });
      const data = tx.plApplication.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('status');
      expect(tx.plLoan.upsert).not.toHaveBeenCalled();
    });

    it.each(['PENDING_CREDIT_REVIEW', 'LENDER_APPROVED', 'LENDER_REJECTED', 'LOAN_CLOSED'])('is a no-op replay once final approval has already resolved to %s', async (terminal) => {
      const { processor, tx } = base({ applicationStatus: terminal, decisionPayloadVersion: 2 });
      await processor.process('EVENT-1', 'LOCK-1', 'PARTNER-1', {
        decision: 'APPROVED', providerStatus: 'APPROVED', decisionReference: 'DEC-2',
      });
      expect(tx.plApplication.update).not.toHaveBeenCalled();
      expect(tx.plLoan.upsert).not.toHaveBeenCalled();
    });
  });

  it('persists a REJECTED outcome as terminal at either stage', async () => {
    const { processor, tx } = base({ decisionPayloadVersion: 2, applicationStatus: 'LENDER_PRE_APPROVED' });
    await processor.process('EVENT-1', 'LOCK-1', 'PARTNER-1', {
      decision: 'REJECTED', providerStatus: 'DECLINED', decisionReference: 'DEC-2',
      rejectionReasonCode: 'POLICY_DECLINE', coolingOffDays: 30,
    });

    expect(tx.lenderApplicationLink.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ normalizedDecision: 'REJECTED', rejectionReasonCode: 'POLICY_DECLINE' }),
    }));
    expect(tx.plApplication.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'LENDER_REJECTED', lenderCoolingOffDays: 30, lenderCoolingOffUntil: expect.any(Date) }),
    }));
  });
});
