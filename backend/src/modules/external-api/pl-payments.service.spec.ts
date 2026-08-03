import { Test, TestingModule } from '@nestjs/testing';
import { PlPaymentsService } from './pl-payments.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { LenderIntegrationOutboxService } from '../lender-integrations/lender-integration-outbox.service';

// Mock easebuzz-iframe.integration
jest.mock('../../integrations/easebuzz-iframe.integration', () => ({
  initiateEasebuzzIframePayment: jest.fn(),
  verifyEasebuzzWebhookHash: jest.fn(),
}));

// Mock easebuzz.integration
jest.mock('../../integrations/easebuzz.integration', () => ({
  createPlEasyCollectLink: jest.fn(),
  extractPlEasebuzzId: jest.fn(),
  extractPlPaymentLink: jest.fn(),
}));

import { verifyEasebuzzWebhookHash } from '../../integrations/easebuzz-iframe.integration';

describe('PlPaymentsService - Webhook Security', () => {
  let service: PlPaymentsService;
  let prisma: any;
  let lenderIntegrationOutbox: any;

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
      plPaymentLink: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      plApplication: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      plWebhookInbox: {
        create: jest.fn(),
      },
      $queryRaw: jest.fn(),
    };
    lenderIntegrationOutbox = {
      recordDataSharingConsent: jest.fn(),
      enqueueCreateAfterVerifiedPayment: jest.fn().mockResolvedValue({ id: 'OUTBOX-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlPaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: LenderIntegrationOutboxService, useValue: lenderIntegrationOutbox },
      ],
    }).compile();

    service = module.get<PlPaymentsService>(PlPaymentsService);
  });

  it('should reject invalid webhook signature', async () => {
    (verifyEasebuzzWebhookHash as jest.Mock).mockReturnValue(false);
    
    const result = await service.handleEasebuzzWebhook({
      data: {
        txnid: 'test_txn_001',
        hash: 'invalid_hash_string',
        amount: '500.00',
        status: 'success'
      }
    }, {});

    expect(result!.success).toBe(false);
    expect(result!.message).toContain('Invalid webhook signature');
  });

  it('should reject non-SUCCESS status without mutating application', async () => {
    (verifyEasebuzzWebhookHash as jest.Mock).mockReturnValue(true);
    
    const paymentRow = {
      id: BigInt(1),
      status: 'CREATED',
      amount: new Prisma.Decimal('590.00'),
      purpose: 'ASSESSMENT_FEE',
      application_number: 'APP-001',
      application_id: BigInt(1),
      paidAt: null,
      easebuzzId: null,
    };

    const appRow = {
      id: BigInt(1),
      status: 'LENDER_ALLOCATED',
      assessment_fee_total_amount: new Prisma.Decimal('590.00'),
      application_number: 'APP-001',
    };

    prisma.plWebhookInbox.create.mockResolvedValue({});
    prisma.$queryRaw
      .mockResolvedValueOnce([paymentRow])   // lock payment
      .mockResolvedValueOnce([appRow]);       // lock application

    prisma.plPaymentLink.update.mockResolvedValue({ ...paymentRow, status: 'FAILED' });

    const result = await service.handleEasebuzzWebhook({
      data: {
        txnid: 'TXN-FAIL-001',
        hash: 'valid_hash',
        amount: '590.00',
        status: 'failure',
        udf4: 'PL',
      }
    }, {});

    expect(result!.success).toBe(true);
    // Application should NOT be updated to ASSESSMENT_FEE_PAID
    expect(prisma.plApplication.update).not.toHaveBeenCalled();
  });

  it('should transition application to ASSESSMENT_FEE_PAID on SUCCESS', async () => {
    (verifyEasebuzzWebhookHash as jest.Mock).mockReturnValue(true);
    
    const paymentRow = {
      id: BigInt(1),
      status: 'CREATED',
      amount: new Prisma.Decimal('590.00'),
      purpose: 'ASSESSMENT_FEE',
      application_number: 'APP-001',
      application_id: BigInt(1),
      paidAt: null,
      easebuzzId: null,
    };

    const appRow = {
      id: BigInt(1),
      status: 'LENDER_ALLOCATED',
      assessment_fee_total_amount: new Prisma.Decimal('590.00'),
      application_number: 'APP-001',
    };

    prisma.plWebhookInbox.create.mockResolvedValue({});
    prisma.$queryRaw
      .mockResolvedValueOnce([paymentRow])
      .mockResolvedValueOnce([appRow]);

    prisma.plPaymentLink.update.mockResolvedValue({ ...paymentRow, status: 'SUCCESS' });
    prisma.plApplication.update.mockResolvedValue({ ...appRow, status: 'ASSESSMENT_FEE_PAID' });

    const result = await service.handleEasebuzzWebhook({
      data: {
        txnid: 'TXN-SUCCESS-001',
        hash: 'valid_hash',
        amount: '590.00',
        status: 'success',
        udf4: 'PL',
      }
    }, {});

    expect(result!.success).toBe(true);
    expect(prisma.plApplication.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ASSESSMENT_FEE_PAID' }),
      }),
    );
    expect(lenderIntegrationOutbox.enqueueCreateAfterVerifiedPayment).toHaveBeenCalledWith(prisma, BigInt(1));
  });

  it('should be idempotent on duplicate replay (P2002)', async () => {
    (verifyEasebuzzWebhookHash as jest.Mock).mockReturnValue(true);
    
    const duplicateError = new Error('Unique constraint failed') as any;
    duplicateError.code = 'P2002';
    prisma.plWebhookInbox.create.mockRejectedValue(duplicateError);

    const result = await service.handleEasebuzzWebhook({
      data: {
        txnid: 'TXN-REPLAY-001',
        hash: 'valid_hash',
        amount: '590.00',
        status: 'success',
        udf4: 'PL',
      }
    }, {});

    expect(result!.success).toBe(true);
    expect(result!.message).toContain('idempotent replay');
    // Payment should NOT be updated
    expect(prisma.plPaymentLink.update).not.toHaveBeenCalled();
    expect(lenderIntegrationOutbox.enqueueCreateAfterVerifiedPayment).not.toHaveBeenCalled();
  });

  it('should reject webhook with amount mismatch', async () => {
    (verifyEasebuzzWebhookHash as jest.Mock).mockReturnValue(true);
    
    const paymentRow = {
      id: BigInt(1),
      status: 'CREATED',
      amount: new Prisma.Decimal('590.00'),
      purpose: 'ASSESSMENT_FEE',
      application_number: 'APP-001',
      paidAt: null,
    };

    prisma.plWebhookInbox.create.mockResolvedValue({});
    prisma.$queryRaw.mockResolvedValueOnce([paymentRow]);

    const result = await service.handleEasebuzzWebhook({
      data: {
        txnid: 'TXN-AMT-001',
        hash: 'valid_hash',
        amount: '100.00',  // Mismatch!
        status: 'success',
        udf4: 'PL',
      }
    }, {});

    expect(result!.success).toBe(false);
    expect(result!.message).toContain('Webhook amount does not match');
  });

  it('should reject webhook with invalid currency', async () => {
    (verifyEasebuzzWebhookHash as jest.Mock).mockReturnValue(true);
    
    const result = await service.handleEasebuzzWebhook({
      data: {
        txnid: 'TXN-CUR-001',
        hash: 'valid_hash',
        amount: '590.00',
        status: 'success',
        currency: 'USD',
        udf4: 'PL',
      }
    }, {});

    expect(result!.success).toBe(false);
    expect(result!.message).toContain('Invalid currency');
  });

  it('should not re-transition app already at ASSESSMENT_FEE_PAID', async () => {
    (verifyEasebuzzWebhookHash as jest.Mock).mockReturnValue(true);
    
    const paymentRow = {
      id: BigInt(1),
      status: 'SUCCESS',
      amount: new Prisma.Decimal('590.00'),
      purpose: 'ASSESSMENT_FEE',
      application_number: 'APP-001',
      application_id: BigInt(1),
      paidAt: new Date(),
      easebuzzId: 'E001',
    };

    const appRow = {
      id: BigInt(1),
      status: 'ASSESSMENT_FEE_PAID',  // Already transitioned
      assessment_fee_total_amount: new Prisma.Decimal('590.00'),
      application_number: 'APP-001',
    };

    prisma.plWebhookInbox.create.mockResolvedValue({});
    prisma.$queryRaw
      .mockResolvedValueOnce([paymentRow])
      .mockResolvedValueOnce([appRow]);
    prisma.plPaymentLink.update.mockResolvedValue(paymentRow);

    await service.handleEasebuzzWebhook({
      data: {
        txnid: 'TXN-IDEMPOTENT-001',
        hash: 'valid_hash',
        amount: '590.00',
        status: 'success',
        udf4: 'PL',
      }
    }, {});

    // Application should NOT be updated again
    expect(prisma.plApplication.update).not.toHaveBeenCalled();
  });

  it('should reject webhook when payment record not found', async () => {
    (verifyEasebuzzWebhookHash as jest.Mock).mockReturnValue(true);
    
    prisma.plWebhookInbox.create.mockResolvedValue({});
    prisma.$queryRaw.mockResolvedValueOnce([]);  // No payment found

    const result = await service.handleEasebuzzWebhook({
      data: {
        txnid: 'TXN-MISSING-001',
        hash: 'valid_hash',
        amount: '590.00',
        status: 'success',
        udf4: 'PL',
      }
    }, {});

    expect(result!.success).toBe(false);
    expect(result!.message).toContain('Payment record was not found');
  });
});
