import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { runsBackgroundWork } from '../../common/utils/app-role.helper';
import { LenderIntegrationService } from './lender-integration.service';
import { normalizeLenderIntegrationError } from './lender-integration.errors';

const DEFAULT_CONCURRENCY = 3;
const MAX_CONCURRENCY = 20;
const QUEUE_DEPTH_CHECK_MS = 60_000;
const BACKLOG_WARN_SECONDS = 60;
const SHUTDOWN_DRAIN_MS = 20_000;

/**
 * Drains the lender outbox.
 *
 * Events are processed concurrently (up to LENDER_INTEGRATION_WORKER_CONCURRENCY at once),
 * but NEVER two events of the same application at the same time: the journey's lender
 * stages (CREATE, CONSENT, UPDATE, DECISION, DISBURSE ...) must stay strictly ordered per
 * application, exactly as they were when this worker handled one event at a time.
 * Different applications no longer queue behind each other, so one slow lender call no
 * longer holds up every other customer, and a finished event immediately picks up the
 * next one (including the follow-up stage it just enqueued) instead of waiting for the
 * next poll tick.
 */
@Injectable()
export class LenderIntegrationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LenderIntegrationWorker.name);
  private readonly workerId = `lender-worker-${randomUUID()}`;
  private timer?: NodeJS.Timeout;
  private lastRecoveryAt = 0;
  private lastDepthCheckAt = 0;

  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly busyApplications = new Set<string>();
  private pumping = false;
  private pumpRequested = false;
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: LenderIntegrationService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.get<boolean>('LENDER_INTEGRATION_WORKER_ENABLED') || this.config.get<string>('NODE_ENV') === 'test') return;
    // A pure API process (APP_ROLE=api) never runs background work - see app-role.helper.ts.
    if (!runsBackgroundWork(this.config)) return;
    try {
      await this.recoverStaleEvents();
    } catch (error) {
      this.logger.error(`Lender worker startup recovery failed: ${(error as Error).message}`);
    }
    const intervalMs = this.config.get<number>('LENDER_INTEGRATION_WORKER_POLL_MS') ?? 2000;
    this.timer = setInterval(() => this.requestPump(), intervalMs);
    this.timer.unref();
    this.requestPump();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    // Let events already on the wire finish (bounded) rather than abandoning them
    // mid-call, which would leave their rows PROCESSING until the lease expires.
    const pending = [...this.inFlight.values()];
    if (!pending.length) return;
    let cutoff: NodeJS.Timeout | undefined;
    await Promise.race([
      Promise.allSettled(pending),
      new Promise<void>((resolve) => {
        cutoff = setTimeout(resolve, SHUTDOWN_DRAIN_MS);
      }),
    ]);
    if (cutoff) clearTimeout(cutoff);
  }

  private concurrency(): number {
    const configured = Number(this.config.get<number>('LENDER_INTEGRATION_WORKER_CONCURRENCY') ?? DEFAULT_CONCURRENCY);
    return Number.isFinite(configured) ? Math.min(MAX_CONCURRENCY, Math.max(1, Math.floor(configured))) : DEFAULT_CONCURRENCY;
  }

  /** Wakes the pump. Safe to call from anywhere, any number of times. */
  private requestPump(): void {
    if (this.stopped) return;
    this.pumpRequested = true;
    if (this.pumping) return;
    void this.pump();
  }

  private async pump(): Promise<void> {
    this.pumping = true;
    try {
      while (this.pumpRequested && !this.stopped) {
        this.pumpRequested = false;
        await this.maintain();
        void this.checkQueueDepth();
        while (!this.stopped && this.inFlight.size < this.concurrency()) {
          const event = await this.claimNextEvent([...this.busyApplications]);
          if (!event) break;
          this.start(event);
        }
      }
    } catch (error) {
      this.logger.error(`Lender worker poll failed: ${(error as Error).message}`);
    } finally {
      this.pumping = false;
    }
  }

  private start(event: any): void {
    const eventKey = String(event.id);
    const applicationKey = String(event.applicationId);
    this.busyApplications.add(applicationKey);
    const task = this.processClaimed(event)
      .catch((error) => this.logger.error(`Lender event=${event.id} failed unexpectedly: ${(error as Error).message}`))
      .finally(() => {
        this.busyApplications.delete(applicationKey);
        this.inFlight.delete(eventKey);
        // The stage that just finished may have enqueued its successor - pick it up now.
        this.requestPump();
      });
    this.inFlight.set(eventKey, task);
  }

  /** Recovers events whose worker died mid-call, at most every few minutes. */
  private async maintain(): Promise<void> {
    const staleSeconds = this.config.get<number>('LENDER_INTEGRATION_WORKER_LOCK_SECONDS') ?? 300;
    if (Date.now() - this.lastRecoveryAt >= Math.max(30_000, staleSeconds * 500)) {
      await this.recoverStaleEvents();
      this.lastRecoveryAt = Date.now();
    }
  }

  /**
   * Monitoring only: warns when due events have been waiting a while, which is the first
   * visible sign the lender queue cannot keep up. Never throws, never blocks processing.
   */
  private async checkQueueDepth(): Promise<void> {
    if (Date.now() - this.lastDepthCheckAt < QUEUE_DEPTH_CHECK_MS) return;
    this.lastDepthCheckAt = Date.now();
    try {
      const rows = await this.prisma.$queryRaw<Array<{ due: bigint; oldestSeconds: number | null }>>`
        SELECT COUNT(*) AS due, TIMESTAMPDIFF(SECOND, MIN(availableAt), NOW(3)) AS oldestSeconds
        FROM LenderIntegrationOutbox
        WHERE status IN ('PENDING', 'RETRY_PENDING') AND availableAt <= NOW(3)
      `;
      const due = Number(rows[0]?.due ?? 0);
      const oldest = Number(rows[0]?.oldestSeconds ?? 0);
      if (due > 0 && oldest >= BACKLOG_WARN_SECONDS) {
        this.logger.warn(
          `Lender queue backlog: ${due} due event(s), oldest waiting ${oldest}s (in flight ${this.inFlight.size}, concurrency ${this.concurrency()})`,
        );
      }
    } catch {
      // monitoring must never affect processing
    }
  }

  /** Claims and fully processes a single event. Kept for tests and manual draining. */
  async drainOnce(): Promise<boolean> {
    try {
      await this.maintain();
      const event = await this.claimNextEvent([...this.busyApplications]);
      if (!event) return false;
      const applicationKey = String(event.applicationId);
      this.busyApplications.add(applicationKey);
      try {
        await this.processClaimed(event);
      } finally {
        this.busyApplications.delete(applicationKey);
      }
      return true;
    } catch (error) {
      this.logger.error(`Lender worker poll failed: ${(error as Error).message}`);
      return false;
    }
  }

  private async processClaimed(event: any): Promise<void> {
    try {
      const completedAtomically = await this.integrations.processEvent(event.id, event.lockToken);
      if (!completedAtomically) {
        const completed = await this.prisma.lenderIntegrationOutbox.updateMany({
          where: { id: event.id, status: 'PROCESSING', lockToken: event.lockToken },
          data: { status: 'COMPLETED', processedAt: new Date(), lockedAt: null, lockedBy: null, lockToken: null, leaseExpiresAt: null, lastErrorCode: null, lastErrorMessage: null },
        });
        if (completed.count !== 1) this.logger.warn(`Lender event=${event.id} completion ignored because the worker lease was lost.`);
      }
    } catch (unknownError) {
      const error = normalizeLenderIntegrationError(unknownError);
      const stillOwned = await this.prisma.lenderIntegrationOutbox.count({ where: { id: event.id, status: 'PROCESSING', lockToken: event.lockToken } });
      if (!stillOwned) {
        this.logger.warn(`Lender event=${event.id} failure ignored because the worker lease was lost.`);
        return;
      }
      const policy = await this.retryPolicy(event.applicationId);
      const retrying = error.retryable && event.attemptCount < policy.maximumAttempts;
      await this.integrations.markStageFailure(event.id, event.lockToken, error, retrying);
      const retryDelay = policy.scheduleSeconds[Math.min(event.attemptCount, policy.scheduleSeconds.length - 1)] ?? 3600;
      await this.prisma.lenderIntegrationOutbox.updateMany({
        where: { id: event.id, status: 'PROCESSING', lockToken: event.lockToken },
        data: {
          status: retrying ? 'RETRY_PENDING' : 'FAILED',
          availableAt: retrying ? new Date(Date.now() + retryDelay * 1000) : event.availableAt,
          processedAt: retrying ? null : new Date(),
          lockedAt: null,
          lockedBy: null,
          lockToken: null,
          leaseExpiresAt: null,
          lastErrorCode: error.code,
          lastErrorMessage: error.message,
        },
      });
      this.logger.warn(`Lender event=${event.id} stage=${event.integrationStage} code=${error.code} retrying=${retrying}`);
    }
  }

  async recoverStaleEvents(): Promise<number> {
    const result = await this.prisma.lenderIntegrationOutbox.updateMany({
      where: { status: 'PROCESSING', leaseExpiresAt: { lt: new Date() } },
      data: { status: 'RETRY_PENDING', availableAt: new Date(), lockedAt: null, lockedBy: null, lockToken: null, leaseExpiresAt: null, lastErrorCode: 'WORKER_LOCK_RECOVERED', lastErrorMessage: 'Recovered after an expired worker lease.' },
    });
    return result.count;
  }

  /**
   * Claims the oldest due event, skipping any application this process is already
   * working on (keeps each application's stages strictly sequential) and any row another
   * worker holds (SKIP LOCKED).
   */
  private async claimNextEvent(excludeApplicationIds: string[] = []): Promise<any | null> {
    const exclusion = excludeApplicationIds.length
      ? Prisma.sql`AND applicationId NOT IN (${Prisma.join(excludeApplicationIds.map((id) => BigInt(id)))})`
      : Prisma.empty;
    return this.prisma.$transaction(
      async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM LenderIntegrationOutbox
        WHERE status IN ('PENDING', 'RETRY_PENDING')
          AND availableAt <= NOW(3)
          ${exclusion}
        ORDER BY availableAt ASC, createdAt ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `;
      if (!rows[0]) return null;
      const lockToken = randomUUID();
      const leaseSeconds = this.config.get<number>('LENDER_INTEGRATION_WORKER_LOCK_SECONDS') ?? 300;
      const updated = await tx.lenderIntegrationOutbox.updateMany({
        where: { id: rows[0].id, status: { in: ['PENDING', 'RETRY_PENDING'] } },
        data: { status: 'PROCESSING', lockedAt: new Date(), lockedBy: this.workerId, lockToken, leaseExpiresAt: new Date(Date.now() + leaseSeconds * 1000), attemptCount: { increment: 1 } },
      });
      if (updated.count !== 1) return null;
      return tx.lenderIntegrationOutbox.findUnique({ where: { id: rows[0].id } });
    },
    { maxWait: 15000, timeout: 20000 });
  }

  private async retryPolicy(applicationId: bigint): Promise<{ maximumAttempts: number; scheduleSeconds: number[] }> {
    const link = await this.prisma.lenderApplicationLink.findUnique({ where: { applicationId }, include: { integrationConfig: true } });
    const maximumAttempts = link?.integrationConfig.maximumRetryAttempts ?? 5;
    const rawSchedule = link?.integrationConfig.retryScheduleSeconds ?? '0,60,300,900,3600';
    const scheduleSeconds = rawSchedule.split(',').map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value >= 0);
    return { maximumAttempts, scheduleSeconds: scheduleSeconds.length ? scheduleSeconds : [0, 60, 300, 900, 3600] };
  }
}
