import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const describeDatabase = process.env.RUN_DB_CONCURRENCY_TESTS === 'true' ? describe : describe.skip;

describeDatabase('Lender integration MySQL concurrency', () => {
  jest.setTimeout(60_000);
  const first = new PrismaClient();
  const second = new PrismaClient();
  const created: { customerId?: bigint; applicationId?: bigint; eventIds: string[] } = { eventIds: [] };

  afterAll(async () => {
    if (created.eventIds.length) await first.lenderIntegrationOutbox.deleteMany({ where: { id: { in: created.eventIds } } });
    if (created.applicationId) await first.plApplication.delete({ where: { id: created.applicationId } }).catch(() => undefined);
    if (created.customerId) await first.customer.delete({ where: { id: created.customerId } }).catch(() => undefined);
    await Promise.all([first.$disconnect(), second.$disconnect()]);
  });

  it('uses SKIP LOCKED and rejects completion by a stale fencing token', async () => {
    const lender = await first.lender.findFirst({ select: { id: true } });
    if (!lender) throw new Error('A lender fixture is required for the database concurrency test.');
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const customer = await first.customer.create({
      data: {
        customerCode: `DBT${suffix}`.slice(0, 30),
        mobileNumber: `8${suffix.slice(-9)}`,
      },
    });
    created.customerId = customer.id;
    const application = await first.plApplication.create({
      data: {
        customerId: customer.id,
        applicationNumber: `DB-CONC-${suffix}`.slice(0, 50),
        lenderId: lender.id,
      },
    });
    created.applicationId = application.id;
    for (const version of [91, 92]) {
      const event = await first.lenderIntegrationOutbox.create({
        data: {
          eventType: 'LENDER_STATUS_CHECK',
          applicationId: application.id,
          applicationReference: application.applicationNumber,
          lenderId: lender.id,
          integrationStage: 'STATUS',
          payloadVersion: version,
          idempotencyKey: `${application.applicationNumber}:DB_CONCURRENCY:V${version}`,
        },
      });
      created.eventIds.push(event.id);
    }

    let unlock!: () => void;
    const holdLock = new Promise<void>((resolve) => { unlock = resolve; });
    let locked!: () => void;
    const lockAcquired = new Promise<void>((resolve) => { locked = resolve; });
    let firstId = '';
    const firstTransaction = first.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM LenderIntegrationOutbox
        WHERE id = ${created.eventIds[0]} FOR UPDATE SKIP LOCKED
      `;
      firstId = rows[0].id;
      locked();
      await holdLock;
    }, { timeout: 30_000 });

    await lockAcquired;
    const secondResult = await second.$transaction(async (tx) => {
      const skipped = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM LenderIntegrationOutbox
        WHERE id = ${firstId} FOR UPDATE SKIP LOCKED
      `;
      const remainingId = created.eventIds.find((id) => id !== firstId)!;
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM LenderIntegrationOutbox
        WHERE id = ${remainingId} FOR UPDATE SKIP LOCKED
      `;
      return { skipped, secondId: rows[0]?.id };
    });
    unlock();
    await firstTransaction;
    expect(secondResult.skipped).toHaveLength(0);
    expect(secondResult.secondId).toBeTruthy();
    expect(secondResult.secondId).not.toBe(firstId);

    const oldToken = randomUUID();
    const currentToken = randomUUID();
    await first.lenderIntegrationOutbox.update({
      where: { id: firstId },
      data: { status: 'PROCESSING', lockToken: oldToken, lockedBy: 'old-worker', lockedAt: new Date(), leaseExpiresAt: new Date(Date.now() - 1000) },
    });
    await first.lenderIntegrationOutbox.updateMany({
      where: { id: firstId, status: 'PROCESSING', lockToken: oldToken, leaseExpiresAt: { lt: new Date() } },
      data: { status: 'RETRY_PENDING', lockToken: null, lockedBy: null, lockedAt: null, leaseExpiresAt: null },
    });
    await first.lenderIntegrationOutbox.update({
      where: { id: firstId },
      data: { status: 'PROCESSING', lockToken: currentToken, lockedBy: 'current-worker', lockedAt: new Date(), leaseExpiresAt: new Date(Date.now() + 60_000) },
    });
    const staleCompletion = await first.lenderIntegrationOutbox.updateMany({
      where: { id: firstId, status: 'PROCESSING', lockToken: oldToken },
      data: { status: 'COMPLETED' },
    });
    const currentCompletion = await first.lenderIntegrationOutbox.updateMany({
      where: { id: firstId, status: 'PROCESSING', lockToken: currentToken },
      data: { status: 'COMPLETED', lockToken: null, lockedBy: null, lockedAt: null, leaseExpiresAt: null },
    });
    expect(staleCompletion.count).toBe(0);
    expect(currentCompletion.count).toBe(1);
  });
});
