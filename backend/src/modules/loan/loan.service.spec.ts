import { LoanService } from './loan.service';
import { Prisma } from '@prisma/client';
import { BadRequestException, NotFoundException } from '@nestjs/common';

const buildService = () => {
  const prisma: any = {
    $transaction: jest.fn((cb: any) => cb(prisma)),
    plLoan: { findFirst: jest.fn(), update: jest.fn() },
    plRepaymentSchedule: { findUnique: jest.fn(), update: jest.fn(), count: jest.fn().mockResolvedValue(1) },
    plRepayment: { findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
    plRepaymentAllocation: { create: jest.fn() },
    plLoanCharge: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    plLoanChargeWaiver: { create: jest.fn() },
  };
  const auditLogs: any = { record: jest.fn().mockResolvedValue(undefined) };
  const lenderIntegrationOutbox: any = {
    enqueueRepaymentNotification: jest.fn().mockResolvedValue(undefined),
    enqueueChargeNotification: jest.fn().mockResolvedValue(undefined),
    enqueueChargeWaiverNotification: jest.fn().mockResolvedValue(undefined),
  };
  const service = new LoanService(
    prisma,
    auditLogs,
    {} as any, // digitapService
    {} as any, // externalApiService
    {} as any, // easebuzzAutocollectService
    {} as any, // configService
    {} as any, // productCalculationService
    lenderIntegrationOutbox,
  );
  return { service, prisma, auditLogs, lenderIntegrationOutbox };
};

describe('LoanService.processRepayment', () => {
  const setUpFullPayment = (prisma: any) => {
    prisma.plLoan.findFirst.mockResolvedValue({ id: 20n, applicationId: 1n, lan: 'FTPL00000001' });
    prisma.plRepaymentSchedule.findUnique.mockResolvedValue({
      id: 900n, lan: 'FTPL00000001', installmentNumber: 1, interest: new Prisma.Decimal('100'),
      principal: new Prisma.Decimal('900'), emi: new Prisma.Decimal('1000'), paidAmount: new Prisma.Decimal('0'),
      remainingAmount: new Prisma.Decimal('1000'), paymentStatus: 'PENDING',
    });
    prisma.plRepayment.create.mockResolvedValue({ id: 501n, paymentId: 'PAY-1', referenceNumber: 'REF-1' });
  };

  it('records a new repayment and enqueues a lender repayment notification', async () => {
    const { service, prisma, lenderIntegrationOutbox } = buildService();
    setUpFullPayment(prisma);

    const result = await service.processRepayment('FTPL00000001', { installmentNumber: 1, amount: 1000 });

    expect(result.success).toBe(true);
    expect(prisma.plRepayment.create).toHaveBeenCalled();
    expect(lenderIntegrationOutbox.enqueueRepaymentNotification).toHaveBeenCalledWith(1n, 501n);
  });

  it('sets the loan to FULLY_PAID when this was the last outstanding installment', async () => {
    const { service, prisma, auditLogs } = buildService();
    setUpFullPayment(prisma);
    prisma.plRepaymentSchedule.count.mockResolvedValue(0);

    const result = await service.processRepayment('FTPL00000001', { installmentNumber: 1, amount: 1000 });

    expect(result.paymentStatus).toBe('PAID');
    expect((result as any).loanFullyPaid).toBe(true);
    expect(prisma.plRepaymentSchedule.count).toHaveBeenCalledWith({ where: { lan: 'FTPL00000001', paymentStatus: { not: 'PAID' } } });
    expect(prisma.plLoan.update).toHaveBeenCalledWith({ where: { id: 20n }, data: { status: 'FULLY_PAID' } });
    expect(auditLogs.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'LOAN_FULLY_PAID' }));
  });

  it('does not mark the loan fully paid while other installments remain outstanding', async () => {
    const { service, prisma } = buildService();
    setUpFullPayment(prisma);
    prisma.plRepaymentSchedule.count.mockResolvedValue(2);

    const result = await service.processRepayment('FTPL00000001', { installmentNumber: 1, amount: 1000 });

    expect(result.paymentStatus).toBe('PAID');
    expect((result as any).loanFullyPaid).toBe(false);
    expect(prisma.plLoan.update).not.toHaveBeenCalled();
  });

  it('does not check for full repayment on a partial installment payment', async () => {
    const { service, prisma } = buildService();
    setUpFullPayment(prisma);

    const result = await service.processRepayment('FTPL00000001', { installmentNumber: 1, amount: 400 });

    expect(result.paymentStatus).toBe('PARTIAL');
    expect((result as any).loanFullyPaid).toBe(false);
    expect(prisma.plRepaymentSchedule.count).not.toHaveBeenCalled();
    expect(prisma.plLoan.update).not.toHaveBeenCalled();
  });

  it('does not enqueue a notification on a duplicate-by-referenceNumber replay', async () => {
    const { service, prisma, lenderIntegrationOutbox } = buildService();
    setUpFullPayment(prisma);
    prisma.plRepayment.findFirst.mockResolvedValue({ paymentId: 'PAY-EXISTING', referenceNumber: 'REF-1' });

    const result = await service.processRepayment('FTPL00000001', { installmentNumber: 1, amount: 1000, referenceNumber: 'REF-1' });

    expect((result as any).duplicate).toBe(true);
    expect(prisma.plRepayment.create).not.toHaveBeenCalled();
    expect(lenderIntegrationOutbox.enqueueRepaymentNotification).not.toHaveBeenCalled();
  });

  it('does not enqueue a notification on a duplicate-by-paymentId replay', async () => {
    const { service, prisma, lenderIntegrationOutbox } = buildService();
    setUpFullPayment(prisma);
    prisma.plRepayment.findUnique.mockResolvedValue({ paymentId: 'PAY-EXISTING', referenceNumber: 'REF-EXISTING' });

    const result = await service.processRepayment('FTPL00000001', { installmentNumber: 1, amount: 1000, paymentId: 'PAY-EXISTING' });

    expect((result as any).duplicate).toBe(true);
    expect(prisma.plRepayment.create).not.toHaveBeenCalled();
    expect(lenderIntegrationOutbox.enqueueRepaymentNotification).not.toHaveBeenCalled();
  });

  it('throws when the loan does not exist', async () => {
    const { service, prisma } = buildService();
    prisma.plLoan.findFirst.mockResolvedValue(null);

    await expect(service.processRepayment('MISSING-LAN', { installmentNumber: 1, amount: 1000 })).rejects.toThrow(NotFoundException);
  });
});

describe('LoanService.addLoanCharge', () => {
  it('creates a PENDING charge and enqueues a lender charge notification', async () => {
    const { service, prisma, lenderIntegrationOutbox } = buildService();
    prisma.plLoan.findFirst.mockResolvedValue({ id: 20n, applicationId: 1n, lan: 'FTPL00000001' });
    prisma.plLoanCharge.create.mockResolvedValue({ id: 601n });

    const result = await service.addLoanCharge('FTPL00000001', { chargeType: 'bounce charge', amount: 500, dueDate: new Date('2026-09-05') }, 'USER-1');

    expect(prisma.plLoanCharge.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ chargeType: 'BOUNCE_CHARGE', status: 'PENDING', remainingAmount: expect.any(Prisma.Decimal) }),
    }));
    expect(lenderIntegrationOutbox.enqueueChargeNotification).toHaveBeenCalledWith(1n, 601n);
    expect(result.success).toBe(true);
  });

  it('throws when amount is not a positive number', async () => {
    const { service, prisma } = buildService();
    prisma.plLoan.findFirst.mockResolvedValue({ id: 20n, applicationId: 1n, lan: 'FTPL00000001' });

    await expect(service.addLoanCharge('FTPL00000001', { chargeType: 'BOUNCE_CHARGE', amount: 0, dueDate: new Date() })).rejects.toThrow(BadRequestException);
  });

  it('throws when the loan does not exist', async () => {
    const { service, prisma } = buildService();
    prisma.plLoan.findFirst.mockResolvedValue(null);

    await expect(service.addLoanCharge('MISSING-LAN', { chargeType: 'BOUNCE_CHARGE', amount: 500, dueDate: new Date() })).rejects.toThrow(NotFoundException);
  });
});

describe('LoanService.waiveLoanCharge', () => {
  const setUpCharge = (prisma: any, overrides: any = {}) => {
    prisma.plLoanCharge.findFirst.mockResolvedValue({
      id: 601n, lan: 'FTPL00000001', loanId: 20n, status: 'PENDING',
      remainingAmount: new Prisma.Decimal('500.00'), loan: { applicationId: 1n },
      ...overrides,
    });
  };

  it('fully waives a charge, flips status to WAIVED, and enqueues a lender waiver notification', async () => {
    const { service, prisma, lenderIntegrationOutbox } = buildService();
    setUpCharge(prisma);
    prisma.plLoanChargeWaiver.create.mockResolvedValue({ id: 701n });

    const result = await service.waiveLoanCharge('FTPL00000001', 601n, { waiverAmount: 500 }, 'USER-1');

    expect(prisma.plLoanCharge.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 601n },
      data: expect.objectContaining({ status: 'WAIVED' }),
    }));
    expect(lenderIntegrationOutbox.enqueueChargeWaiverNotification).toHaveBeenCalledWith(1n, 701n);
    expect(result.remainingAmount).toBe(0);
  });

  it('partially waives a charge and keeps its outstanding status', async () => {
    const { service, prisma } = buildService();
    setUpCharge(prisma);
    prisma.plLoanChargeWaiver.create.mockResolvedValue({ id: 702n });

    const result = await service.waiveLoanCharge('FTPL00000001', 601n, { waiverAmount: 200 }, 'USER-1');

    expect(prisma.plLoanCharge.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PENDING', remainingAmount: expect.any(Prisma.Decimal) }),
    }));
    expect(result.remainingAmount).toBe(300);
  });

  it('throws when waiverAmount exceeds the outstanding amount', async () => {
    const { service, prisma } = buildService();
    setUpCharge(prisma);

    await expect(service.waiveLoanCharge('FTPL00000001', 601n, { waiverAmount: 600 })).rejects.toThrow(BadRequestException);
  });

  it('throws when the charge is not outstanding', async () => {
    const { service, prisma } = buildService();
    setUpCharge(prisma, { status: 'WAIVED' });

    await expect(service.waiveLoanCharge('FTPL00000001', 601n, { waiverAmount: 100 })).rejects.toThrow(BadRequestException);
  });

  it('throws when the charge does not exist for the LAN', async () => {
    const { service, prisma } = buildService();
    prisma.plLoanCharge.findFirst.mockResolvedValue(null);

    await expect(service.waiveLoanCharge('FTPL00000001', 999n, { waiverAmount: 100 })).rejects.toThrow(NotFoundException);
  });
});
