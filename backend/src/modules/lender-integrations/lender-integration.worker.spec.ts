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

describe('LenderIntegrationWorker concurrency', () => {
  const flush = async () => {
    for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setImmediate(resolve));
  };

  const build = (queue: Array<{ id: string; applicationId: bigint }>, concurrency?: number) => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'LENDER_INTEGRATION_WORKER_LOCK_SECONDS') return 300;
        if (key === 'LENDER_INTEGRATION_WORKER_CONCURRENCY') return concurrency;
        return undefined;
      }),
    } as unknown as ConfigService;
    const worker = new LenderIntegrationWorker({} as any, {} as any, config);
    (worker as any).lastRecoveryAt = Date.now();
    (worker as any).lastDepthCheckAt = Date.now();

    const remaining = [...queue];
    // Mirrors the SQL: the oldest due event whose application this process is not already on.
    jest.spyOn(worker as any, 'claimNextEvent').mockImplementation((async (exclude: string[] = []) => {
      const index = remaining.findIndex((event) => !exclude.includes(String(event.applicationId)));
      return index < 0 ? null : remaining.splice(index, 1)[0];
    }) as any);

    const started: string[] = [];
    const releases = new Map<string, () => void>();
    const active = new Set<string>();
    let overlapWithinApplication = false;
    jest.spyOn(worker as any, 'processClaimed').mockImplementation(async (event: any) => {
      const application = String(event.applicationId);
      if (active.has(application)) overlapWithinApplication = true;
      active.add(application);
      started.push(event.id);
      await new Promise<void>((resolve) => releases.set(event.id, resolve));
      active.delete(application);
    });
    return { worker, started, release: (id: string) => releases.get(id)!(), overlap: () => overlapWithinApplication };
  };

  it('works different applications in parallel but never two events of one application at once', async () => {
    const { worker, started, release, overlap } = build([
      { id: 'E1', applicationId: 1n },
      { id: 'E2', applicationId: 1n },
      { id: 'E3', applicationId: 2n },
      { id: 'E4', applicationId: 3n },
    ]);

    (worker as any).requestPump();
    await flush();
    // E2 waits behind E1 (same application) while the other applications proceed.
    expect(started).toEqual(['E1', 'E3', 'E4']);

    release('E1');
    await flush();
    expect(started).toEqual(['E1', 'E3', 'E4', 'E2']);

    release('E2');
    release('E3');
    release('E4');
    await flush();
    expect(overlap()).toBe(false);
  });

  it('honours LENDER_INTEGRATION_WORKER_CONCURRENCY and picks up the next event the moment one finishes', async () => {
    const { worker, started, release } = build(
      [
        { id: 'E1', applicationId: 1n },
        { id: 'E2', applicationId: 2n },
      ],
      1,
    );

    (worker as any).requestPump();
    await flush();
    expect(started).toEqual(['E1']);

    // No poll tick needed: completion itself wakes the pump.
    release('E1');
    await flush();
    expect(started).toEqual(['E1', 'E2']);

    release('E2');
    await flush();
  });

  it('excludes applications already in flight from the claim query', async () => {
    const queryRaw = jest.fn().mockResolvedValue([]);
    const prisma: any = { $transaction: jest.fn(async (callback: any) => callback({ $queryRaw: queryRaw })) };
    const config = { get: jest.fn() } as unknown as ConfigService;
    const worker = new LenderIntegrationWorker(prisma, {} as any, config);

    await (worker as any).claimNextEvent(['7', '9']);
    await (worker as any).claimNextEvent([]);

    const withExclusion = queryRaw.mock.calls[0][1];
    const withoutExclusion = queryRaw.mock.calls[1][1];
    expect(withExclusion.sql).toContain('NOT IN');
    expect(withExclusion.values).toEqual([7n, 9n]);
    expect(withoutExclusion.sql).toBe('');
  });
});

describe('LenderIntegrationWorker role', () => {
  const configFor = (role: string) => ({
    get: jest.fn((key: string) => {
      if (key === 'LENDER_INTEGRATION_WORKER_ENABLED') return true;
      if (key === 'NODE_ENV') return 'production';
      if (key === 'APP_ROLE') return role;
      return undefined;
    }),
  }) as unknown as ConfigService;

  it('a pure api process never starts polling the outbox', async () => {
    const prisma: any = { lenderIntegrationOutbox: { updateMany: jest.fn() } };
    const worker = new LenderIntegrationWorker(prisma, {} as any, configFor('api'));

    await worker.onModuleInit();

    expect((worker as any).timer).toBeUndefined();
    expect(prisma.lenderIntegrationOutbox.updateMany).not.toHaveBeenCalled();
  });

  it('the worker role (and the default role) does start polling', async () => {
    for (const role of ['worker', 'all']) {
      const prisma: any = {
        lenderIntegrationOutbox: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
        $transaction: jest.fn().mockResolvedValue(null),
        $queryRaw: jest.fn().mockResolvedValue([]),
      };
      const worker = new LenderIntegrationWorker(prisma, {} as any, configFor(role));

      await worker.onModuleInit();

      expect((worker as any).timer).toBeDefined();
      await worker.onModuleDestroy();
    }
  });
});
