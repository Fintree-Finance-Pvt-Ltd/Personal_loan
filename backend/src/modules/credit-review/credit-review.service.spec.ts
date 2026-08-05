import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreditReviewService } from './credit-review.service';

describe('CreditReviewService', () => {
  const pendingApplication = {
    id: 1n,
    customerId: 2n,
    platformLan: 'FTPL00000001',
    lenderCode: 'FFPL2026',
    lenderId: 'LENDER-1',
    status: 'PENDING_CREDIT_REVIEW',
    lenderApprovedAmount: new Prisma.Decimal('8000'),
    lenderApprovedTenure: 6,
    lenderApprovedRoi: new Prisma.Decimal('14.25'),
  };

  const buildService = (application: any = pendingApplication) => {
    const tx: any = {
      plApplication: { findUnique: jest.fn().mockResolvedValue(application), update: jest.fn().mockImplementation(({ data }: any) => ({ ...application, ...data })) },
      customer: { update: jest.fn() },
      plLoan: { upsert: jest.fn().mockResolvedValue({ id: 10n }) },
    };
    const prisma: any = { $transaction: jest.fn(async (callback: any) => callback(tx)) };
    return { service: new CreditReviewService(prisma), tx };
  };

  describe('approve', () => {
    it('finalizes approval, updates onboarding status and creates the loan from the stored terms', async () => {
      const { service, tx } = buildService();
      const result = await service.approve(1n, 'USER-1');

      expect(tx.plApplication.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 1n },
        data: { status: 'LENDER_APPROVED' },
      }));
      expect(tx.customer.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ onboardingStatus: 'LENDER_APPROVED' }),
      }));
      expect(tx.plLoan.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { applicationId: 1n },
        create: expect.objectContaining({
          lan: 'FTPL00000001',
          approvedAmount: pendingApplication.lenderApprovedAmount,
          offerAllowedTenures: JSON.stringify([6]),
        }),
      }));
      expect(result.decidedByUserId).toBe('USER-1');
    });

    it('rejects approving an application that is not pending credit review', async () => {
      const { service } = buildService({ ...pendingApplication, status: 'LENDER_APPROVED' });
      await expect(service.approve(1n, 'USER-1')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for a missing application', async () => {
      const { service, tx } = buildService();
      tx.plApplication.findUnique.mockResolvedValue(null);
      await expect(service.approve(1n, 'USER-1')).rejects.toThrow(NotFoundException);
    });

    it('rejects approval when the lender-approved terms are incomplete', async () => {
      const { service } = buildService({ ...pendingApplication, lenderApprovedRoi: null });
      await expect(service.approve(1n, 'USER-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('reject', () => {
    it('rejects the application and records the reason', async () => {
      const { service, tx } = buildService();
      await service.reject(1n, 'USER-1', 'Income inconsistent with declared employment');

      expect(tx.plApplication.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          status: 'LENDER_REJECTED',
          lenderDecisionReason: 'Credit review rejected: Income inconsistent with declared employment',
        }),
      }));
      expect(tx.customer.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ onboardingStatus: 'LENDER_REJECTED' }),
      }));
    });

    it('rejects rejecting an application that is not pending credit review', async () => {
      const { service } = buildService({ ...pendingApplication, status: 'LENDER_REJECTED' });
      await expect(service.reject(1n, 'USER-1')).rejects.toThrow(BadRequestException);
    });
  });
});
