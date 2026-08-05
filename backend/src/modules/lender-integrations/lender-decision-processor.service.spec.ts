import { Prisma } from '@prisma/client';
import { LenderDecisionProcessor } from './lender-decision-processor.service';

describe('LenderDecisionProcessor', () => {
  const base = (normalizedDecision: string | null = null) => {
    const event = { id: 'EVENT-1', applicationId: 1n, integrationStage: 'DECISION', payloadVersion: 1 };
    const link = { id: 'LINK-1', partnerApplicationId: 'PARTNER-1', normalizedDecision };
    const application = { id: 1n, customerId: 2n, applicationNumber: 'APP-1', lenderId: 'L1', lenderCode: 'L1', productStrategyVersionId: 'PSV-1', lenderApplicationLink: link };
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
    };
    const prisma: any = { $transaction: jest.fn(async (callback: any) => callback(tx)) };
    return { processor: new LenderDecisionProcessor(prisma), tx };
  };

  it('parks an APPROVED decision in credit review instead of finalizing it', async () => {
    const { processor, tx } = base();
    await processor.process('EVENT-1', 'LOCK-1', 'PARTNER-1', {
      decision: 'APPROVED', providerStatus: 'APPROVED', decisionReference: 'DEC-1',
      approvedAmount: '125000', approvedTenure: 18, approvedRoi: '13.5',
    });

    const data = tx.plApplication.update.mock.calls[0][0].data;
    expect(data).toEqual(expect.objectContaining({
      status: 'PENDING_CREDIT_REVIEW',
      lenderApprovedAmount: new Prisma.Decimal('125000'),
      lenderApprovedTenure: 18,
      lenderApprovedRoi: new Prisma.Decimal('13.5'),
    }));
    expect(data).not.toHaveProperty('requestedAmount');
    expect(tx.customer.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ onboardingStatus: 'PENDING_CREDIT_REVIEW' }),
    }));
    expect(tx.lenderProductVersion.findUnique).not.toHaveBeenCalled();
  });

  it('defaults tenure/ROI from the allocated product version when the lender omits them', async () => {
    const { processor, tx } = base();
    tx.lenderProductVersion.findUnique.mockResolvedValue({
      annualRoiPercent: new Prisma.Decimal('14.25'),
      tenures: [{ tenure: 6, sortOrder: 0 }],
    });

    await processor.process('EVENT-1', 'LOCK-1', 'PARTNER-1', {
      decision: 'APPROVED', providerStatus: 'APPROVED', decisionReference: 'DEC-1',
      approvedAmount: '8000',
    });

    expect(tx.lenderProductVersion.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'PSV-1' } }));
    const data = tx.plApplication.update.mock.calls[0][0].data;
    expect(data).toEqual(expect.objectContaining({
      status: 'PENDING_CREDIT_REVIEW',
      lenderApprovedAmount: new Prisma.Decimal('8000'),
      lenderApprovedTenure: 6,
      lenderApprovedRoi: new Prisma.Decimal('14.25'),
    }));
  });

  it('persists a safe REJECTED outcome and cooling-off date', async () => {
    const { processor, tx } = base();
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

  it('persists PENDING and creates only the stable first status event', async () => {
    const { processor, tx } = base();
    await processor.process('EVENT-1', 'LOCK-1', 'PARTNER-1', {
      decision: 'PENDING', providerStatus: 'UNDER_REVIEW', decisionReference: 'DEC-3',
    });

    expect(tx.plApplication.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'LENDER_REVIEW', lenderNextStatusCheckAt: expect.any(Date) }),
    }));
    expect(tx.lenderIntegrationOutbox.upsert).toHaveBeenCalledTimes(1);
    expect(tx.lenderIntegrationOutbox.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { idempotencyKey: 'APP-1:LENDER_STATUS_CHECK:V1' },
    }));
  });

  it.each(['APPROVED', 'REJECTED'])('does not downgrade terminal %s on delayed results', async (terminal) => {
    const { processor, tx } = base(terminal);
    await processor.process('EVENT-1', 'LOCK-1', 'PARTNER-1', {
      decision: 'PENDING', providerStatus: 'DELAYED', decisionReference: 'DELAYED-1',
    });
    expect(tx.lenderApplicationLink.update).not.toHaveBeenCalled();
    expect(tx.plApplication.update).not.toHaveBeenCalled();
    expect(tx.lenderIntegrationOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'EVENT-1', status: 'PROCESSING', lockToken: 'LOCK-1' },
    }));
  });
});
