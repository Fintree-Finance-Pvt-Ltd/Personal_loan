import { AdminLoanServicingController } from './admin-loan-servicing.controller';
import { BadRequestException } from '@nestjs/common';

describe('AdminLoanServicingController', () => {
  const buildController = () => {
    const loanService: any = {
      addLoanCharge: jest.fn().mockResolvedValue({ success: true, chargeId: '601' }),
      waiveLoanCharge: jest.fn().mockResolvedValue({ success: true, waiverId: '701', remainingAmount: 0 }),
    };
    const controller = new AdminLoanServicingController(loanService);
    return { controller, loanService };
  };

  it('addCharge parses amount/dueDate and forwards the acting user id', async () => {
    const { controller, loanService } = buildController();

    await controller.addCharge(
      'FTPL00000001',
      { chargeType: 'BOUNCE_CHARGE', amount: '500.00', dueDate: '2026-09-05', remarks: 'Cheque bounced' } as any,
      { userId: 'USER-1' } as any,
    );

    expect(loanService.addLoanCharge).toHaveBeenCalledWith(
      'FTPL00000001',
      expect.objectContaining({ chargeType: 'BOUNCE_CHARGE', amount: 500, remarks: 'Cheque bounced' }),
      'USER-1',
    );
  });

  it('waiveCharge parses a valid numeric chargeId and forwards waiverAmount', async () => {
    const { controller, loanService } = buildController();

    await controller.waiveCharge('FTPL00000001', '601', { waiverAmount: '250.00' } as any, { userId: 'USER-1' } as any);

    expect(loanService.waiveLoanCharge).toHaveBeenCalledWith('FTPL00000001', 601n, expect.objectContaining({ waiverAmount: 250 }), 'USER-1');
  });

  it('rejects a non-numeric chargeId before calling the service', () => {
    const { controller, loanService } = buildController();

    expect(() => controller.waiveCharge('FTPL00000001', 'not-a-number', { waiverAmount: '100' } as any, { userId: 'USER-1' } as any)).toThrow(BadRequestException);
    expect(loanService.waiveLoanCharge).not.toHaveBeenCalled();
  });
});
