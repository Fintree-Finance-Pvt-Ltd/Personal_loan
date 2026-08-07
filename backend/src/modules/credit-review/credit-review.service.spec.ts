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
    productStrategyVersionId: 'PSV-1',
    status: 'PENDING_CREDIT_REVIEW',
    selectedAmount: new Prisma.Decimal('8000'),
    selectedTenure: 12,
    lenderApprovedAmount: new Prisma.Decimal('10000'),
    lenderApprovedRoi: new Prisma.Decimal('14.25'),
  };

  const buildService = (application: any = pendingApplication, productVersion: any = { annualRoiPercent: new Prisma.Decimal('14.25') }, kycStatus: any = null, permanentAddress: any = null) => {
    const tx: any = {
      plApplication: { findUnique: jest.fn().mockResolvedValue(application), update: jest.fn().mockImplementation(({ data }: any) => ({ ...application, ...data })) },
      customer: { update: jest.fn() },
      plLoan: { upsert: jest.fn().mockResolvedValue({ id: 10n }) },
      lenderProductVersion: { findUnique: jest.fn().mockResolvedValue(productVersion) },
      kycVerificationStatus: { findUnique: jest.fn().mockResolvedValue(kycStatus) },
      applicationAddress: { findUnique: jest.fn().mockResolvedValue(permanentAddress) },
    };
    const prisma: any = { $transaction: jest.fn(async (callback: any) => callback(tx)) };
    return { service: new CreditReviewService(prisma), tx };
  };

  describe('approve', () => {
    it('finalizes approval using the customer-selected offer and creates the loan on the existing LAN', async () => {
      const { service, tx } = buildService();
      const result = await service.approve(1n, 'USER-1');

      expect(tx.plApplication.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 1n },
        data: expect.objectContaining({ status: 'LENDER_APPROVED', lenderApprovedRoi: pendingApplication.lenderApprovedRoi }),
      }));
      expect(tx.customer.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ onboardingStatus: 'LENDER_APPROVED' }),
      }));
      expect(tx.plLoan.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { applicationId: 1n },
        create: expect.objectContaining({
          lan: 'FTPL00000001',
          approvedAmount: pendingApplication.selectedAmount,
          acceptedTenureDays: 12,
          offerAllowedTenures: JSON.stringify([12]),
        }),
      }));
      expect(result.decidedByUserId).toBe('USER-1');
    });

    it('carries the onboarding-verified Aadhaar KYC and permanent address onto the new loan so DigiLocker is not required again', async () => {
      const kycStatus = {
        aadhaarStatus: 'VERIFIED', aadhaarMaskedNumber: 'XXXX-XXXX-1234', aadhaarName: 'Test Customer',
        aadhaarDob: new Date('1990-05-15'), aadhaarAddress: null, updatedAt: new Date('2026-08-01T00:00:00Z'),
      };
      const permanentAddress = {
        addressLine1: 'Flat 1', addressLine2: null, landmark: null, locality: 'Locality',
        district: 'District', city: 'City', state: 'State', country: 'India', pincode: '400001',
      };
      const { service, tx } = buildService(pendingApplication, undefined, kycStatus, permanentAddress);
      await service.approve(1n, 'USER-1');

      expect(tx.kycVerificationStatus.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { customerId: 2n } }));
      expect(tx.plLoan.upsert).toHaveBeenCalledWith(expect.objectContaining({
        create: expect.objectContaining({
          digilockerStatus: 'VERIFIED',
          aadhaarMaskedNumber: 'XXXX-XXXX-1234',
          aadhaarLastFour: '1234',
          aadhaarVerifiedName: 'Test Customer',
          aadhaarDateOfBirth: kycStatus.aadhaarDob,
          aadhaarCity: 'City',
          aadhaarPincode: '400001',
        }),
      }));
    });

    it('does not set digilockerStatus when no onboarding KYC verification exists', async () => {
      const { service, tx } = buildService();
      await service.approve(1n, 'USER-1');
      const createData = tx.plLoan.upsert.mock.calls[0][0].create;
      expect(createData).not.toHaveProperty('digilockerStatus');
    });

    it('defaults ROI from the allocated product version when not already persisted', async () => {
      const { service, tx } = buildService({ ...pendingApplication, lenderApprovedRoi: null }, { annualRoiPercent: new Prisma.Decimal('16.5') });
      await service.approve(1n, 'USER-1');
      expect(tx.lenderProductVersion.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'PSV-1' } }));
      expect(tx.plApplication.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ lenderApprovedRoi: new Prisma.Decimal('16.5') }),
      }));
    });

    it('rejects approving an application that is not pending final approval', async () => {
      const { service } = buildService({ ...pendingApplication, status: 'LENDER_APPROVED' });
      await expect(service.approve(1n, 'USER-1')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for a missing application', async () => {
      const { service, tx } = buildService();
      tx.plApplication.findUnique.mockResolvedValue(null);
      await expect(service.approve(1n, 'USER-1')).rejects.toThrow(NotFoundException);
    });

    it('rejects approval when no offer has been selected yet', async () => {
      const { service } = buildService({ ...pendingApplication, selectedAmount: null, selectedTenure: null });
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

    it('rejects rejecting an application that is not pending final approval', async () => {
      const { service } = buildService({ ...pendingApplication, status: 'LENDER_REJECTED' });
      await expect(service.reject(1n, 'USER-1')).rejects.toThrow(BadRequestException);
    });
  });
});
