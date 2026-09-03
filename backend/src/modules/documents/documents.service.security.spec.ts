import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DocumentsService } from './documents.service';

describe('DocumentsService customer and liveness ownership', () => {
  const file = { mimetype: 'image/jpeg', size: 10, buffer: Buffer.from('photo') };
  // Consent recording is a side effect of a successful upload; these cases all reject
  // before reaching it.
  const outbox: any = { recordJourneyConsent: jest.fn() };

  it('does not allow a customer to upload against another application', async () => {
    const prisma: any = {
      customer: { findUnique: jest.fn().mockResolvedValue({ id: 1n, customerCode: 'C1' }) },
      plApplication: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new DocumentsService(prisma, outbox);

    await expect(service.saveCustomerLivePhoto(1n, file, { applicationId: '99', livenessVerificationId: 'LIVE-1' }))
      .rejects.toThrow(NotFoundException);
    expect(prisma.plApplication.findFirst).toHaveBeenCalledWith({ where: { id: 99n, customerId: 1n } });
  });

  it('ignores client VERIFIED flags and requires a server-verified liveness record', async () => {
    const prisma: any = {
      customer: { findUnique: jest.fn().mockResolvedValue({ id: 1n, customerCode: 'C1' }) },
      plApplication: { findFirst: jest.fn().mockResolvedValue({ id: 10n, customerId: 1n }) },
      applicationLiveness: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new DocumentsService(prisma, outbox);

    await expect(service.saveCustomerLivePhoto(1n, file, {
      applicationId: '10',
      livenessVerificationId: 'FAKE-LIVE',
      faceLivenessStatus: 'VERIFIED',
      faceLivenessScore: 100,
    })).rejects.toThrow(BadRequestException);
    expect(prisma.applicationLiveness.findFirst).toHaveBeenCalledWith({
      where: { id: 'FAKE-LIVE', applicationId: 10n, verificationStatus: 'VERIFIED' },
    });
  });

  it('scopes live-photo reads to the authenticated customer', async () => {
    const prisma: any = { plCustomerDocument: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new DocumentsService(prisma, outbox);
    await service.getCustomerLivePhoto(42n);
    expect(prisma.plCustomerDocument.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ customerId: 42n }),
    }));
  });
});
