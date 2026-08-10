import { ConfigService } from '@nestjs/config';
import { LenderIntegrationWorker } from './lender-integration.worker';

describe('LenderIntegrationWorker fencing', () => {
  const config = {
    get: jest.fn((key: string) => key === 'LENDER_INTEGRATION_WORKER_LOCK_SECONDS' ? 300 : undefined),
  } as unknown as ConfigService;

  it('completes an event only with the token acquired by the current worker', async () => {
    let currentToken = '';
    const outbox = {
      updateMany: jest.fn().mockImplementation(({ data }: any) => {
        if (data?.lockToken) currentToken = data.lockToken;
        return Promise.resolve({ count: 1 });
      }),
      findUnique: jest.fn().mockImplementation(() => Promise.resolve({
        id: 'EVENT-1', applicationId: 1n, integrationStage: 'CREATE', attemptCount: 1,
        availableAt: new Date(), lockToken: currentToken,
      })),
      count: jest.fn(),
    };
    const tx = { $queryRaw: jest.fn().mockResolvedValue([{ id: 'EVENT-1' }]), lenderIntegrationOutbox: outbox };
    const prisma: any = {
      $transaction: jest.fn(async (callback: any) => callback(tx)),
      lenderIntegrationOutbox: outbox,
    };
    const integrations: any = { processEvent: jest.fn().mockResolvedValue(false), markStageFailure: jest.fn() };
    const worker = new LenderIntegrationWorker(prisma, integrations, config);
    (worker as any).lastRecoveryAt = Date.now();

    await worker.drainOnce();

    expect(integrations.processEvent).toHaveBeenCalledWith('EVENT-1', currentToken);
    expect(outbox.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: 'EVENT-1', status: 'PROCESSING', lockToken: currentToken },
    }));
  });

  it('cannot overwrite an event after another worker reclaimed the lease', async () => {
    let currentToken = '';
    let updates = 0;
    const outbox = {
      updateMany: jest.fn().mockImplementation(({ data }: any) => {
        updates += 1;
        if (data?.lockToken) {
          currentToken = data.lockToken;
          return Promise.resolve({ count: 1 });
        }
        return Promise.resolve({ count: 0 });
      }),
      findUnique: jest.fn().mockImplementation(() => Promise.resolve({
        id: 'EVENT-2', applicationId: 1n, integrationStage: 'CREATE', attemptCount: 1,
        availableAt: new Date(), lockToken: currentToken,
      })),
    };
    const tx = { $queryRaw: jest.fn().mockResolvedValue([{ id: 'EVENT-2' }]), lenderIntegrationOutbox: outbox };
    const prisma: any = { $transaction: jest.fn(async (callback: any) => callback(tx)), lenderIntegrationOutbox: outbox };
    const integrations: any = { processEvent: jest.fn().mockResolvedValue(false), markStageFailure: jest.fn() };
    const worker = new LenderIntegrationWorker(prisma, integrations, config);
    (worker as any).lastRecoveryAt = Date.now();

    await worker.drainOnce();

    expect(updates).toBe(2);
    expect(outbox.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: 'EVENT-2', status: 'PROCESSING', lockToken: currentToken },
    }));
  });

  it('periodically recovers only expired PROCESSING leases', async () => {
    const prisma: any = {
      lenderIntegrationOutbox: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    const worker = new LenderIntegrationWorker(prisma, {} as any, config);
    await expect(worker.recoverStaleEvents()).resolves.toBe(2);
    expect(prisma.lenderIntegrationOutbox.updateMany).toHaveBeenCalledWith({
      where: { status: 'PROCESSING', leaseExpiresAt: { lt: expect.any(Date) } },
      data: expect.objectContaining({ status: 'RETRY_PENDING', lockToken: null, leaseExpiresAt: null }),
    });
  });
});
