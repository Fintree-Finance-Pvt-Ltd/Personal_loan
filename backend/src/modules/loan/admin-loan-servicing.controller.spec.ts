import { AdminLoanServicingController } from './admin-loan-servicing.controller';
import { BadRequestException } from '@nestjs/common';

describe('AdminLoanServicingController', () => {
  const buildController = () => {
    const loanService: any = {
      addLoanCharge: jest.fn().mockResolvedValue({ success: true, chargeId: '601' }),
      waiveLoanCharge: jest.fn().mockResolvedValue({ success: true, waiverId: '701', remainingAmount: 0 }),
    };
    const cronService: any = {
      retryDebit: jest.fn().mockResolvedValue({ success: true, status: 'IN_PROCESS' }),
      sendPreDebitNotification: jest.fn().mockResolvedValue({ success: true, status: 'IN_PROCESS', notificationRequestNumber: 'NOTIF_123' }),
      executeMandate: jest.fn().mockResolvedValue({ success: true, status: 'IN_PROCESS' }),
    };
    const autocollectService: any = {
      getDebitRequests: jest.fn(),
    };
    const prisma: any = {
      easebuzzDebitRequest: { count: jest.fn(), findMany: jest.fn() },
    };
    const controller = new AdminLoanServicingController(loanService, cronService, autocollectService, prisma);
    return { controller, loanService, cronService };
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

  it('retryDebit delegates to easebuzzCollectionCronService for valid rpsId', async () => {
    const { controller, cronService } = buildController();

    const res = await controller.retryDebit('92');
    expect(res).toEqual({ success: true, status: 'IN_PROCESS' });
    expect(cronService.retryDebit).toHaveBeenCalledWith('92', 'MANUAL');
  });

  it('retryDebit throws BadRequestException for non-numeric rpsId', () => {
    const { controller, cronService } = buildController();

    expect(() => controller.retryDebit('abc')).toThrow(BadRequestException);
    expect(cronService.retryDebit).not.toHaveBeenCalled();
  });

  it('sendNotification delegates to easebuzzCollectionCronService for valid rpsId', async () => {
    const { controller, cronService } = buildController();

    const res = await controller.sendNotification('92');
    expect(res).toEqual({ success: true, status: 'IN_PROCESS', notificationRequestNumber: 'NOTIF_123' });
    expect(cronService.sendPreDebitNotification).toHaveBeenCalledWith('92');
  });

  it('sendNotification throws BadRequestException for non-numeric rpsId', () => {
    const { controller, cronService } = buildController();

    expect(() => controller.sendNotification('xyz')).toThrow(BadRequestException);
    expect(cronService.sendPreDebitNotification).not.toHaveBeenCalled();
  });

  it('executeMandate delegates to easebuzzCollectionCronService for valid rpsId', async () => {
    const { controller, cronService } = buildController();

    const res = await controller.executeMandate('92');
    expect(res).toEqual({ success: true, status: 'IN_PROCESS' });
    expect(cronService.executeMandate).toHaveBeenCalledWith('92', 'MANUAL');
  });

  it('executeMandate throws BadRequestException for non-numeric rpsId', () => {
    const { controller, cronService } = buildController();

    expect(() => controller.executeMandate('invalid')).toThrow(BadRequestException);
    expect(cronService.executeMandate).not.toHaveBeenCalled();
  });

  it('getRpsNotificationStatus retrieves notification status for valid rpsId', async () => {
    const { controller } = buildController();
    (controller as any).prisma.easebuzzDebitRequest.findFirst = jest.fn().mockResolvedValue({
      id: 111n,
      rpsId: 92n,
      notificationRequestNumber: 'NT_FTPL00000011_4_4',
      amount: '5005.00',
    });
    (controller as any).easebuzzAutocollectService.retrieveNotification = jest.fn().mockResolvedValue({
      success: true,
      status: 'notified',
      data: {
        id: 'NF2609293DA203',
        status: 'notified',
        notified_at: '2026-09-29 17:15:26',
        amount: 5005,
      },
    });

    const res = await controller.getRpsNotificationStatus('92');
    expect(res.success).toBe(true);
    expect(res.status).toBe('notified');
    expect(res.notificationRequestNumber).toBe('NT_FTPL00000011_4_4');
    expect(res.notifiedAt).toBe('2026-09-29 17:15:26');
  });

  it('getNotificationStatus retrieves status by identifier', async () => {
    const { controller } = buildController();
    (controller as any).easebuzzAutocollectService.retrieveNotification = jest.fn().mockResolvedValue({
      success: true,
      status: 'notified',
    });

    const res = await controller.getNotificationStatus('NT_FTPL00000011_4_4');
    expect(res.success).toBe(true);
    expect(res.status).toBe('notified');
  });
});
