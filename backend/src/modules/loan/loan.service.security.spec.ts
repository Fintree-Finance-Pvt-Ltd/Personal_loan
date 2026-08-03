import { NotFoundException } from '@nestjs/common';
import { LoanService } from './loan.service';

describe('LoanService customer ownership', () => {
  const createService = (prisma: any) => new LoanService(
    prisma,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  it('never falls back to an unscoped LAN lookup', async () => {
    const prisma = { plLoan: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = createService(prisma);

    await expect(service.findLoanByLanAndCustomer('LAN-OTHER', 7n)).rejects.toThrow(NotFoundException);
    expect(prisma.plLoan.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.plLoan.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { lan: 'LAN-OTHER', customerId: 7n },
    }));
  });

  it.each([
    ['bank verification', (service: LoanService) => service.verifyBankAccount('LAN-OTHER', 7n, {})],
    ['mandate', (service: LoanService) => service.initiateMandate('LAN-OTHER', 7n)],
    ['eSign', (service: LoanService) => service.initiateEsign('LAN-OTHER', 7n)],
  ])('blocks another customer from %s before any provider action', async (_name, operation) => {
    const prisma = { plLoan: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = createService(prisma);

    await expect(operation(service)).rejects.toThrow(NotFoundException);
    expect(prisma.plLoan.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { lan: 'LAN-OTHER', customerId: 7n },
    }));
  });
});
