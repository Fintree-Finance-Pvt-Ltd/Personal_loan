// ──────────────────────────────────────────────────────────────────────────
// Partner API – Webhook Outbox Worker
// ──────────────────────────────────────────────────────────────────────────
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { createHmac, randomUUID } from 'crypto';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  PARTNER_WEBHOOK_MAX_ATTEMPTS,
  PARTNER_WEBHOOK_RETRY_SCHEDULE_SECONDS,
} from './partner-api.constants';

@Injectable()
export class PartnerWebhookService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PartnerWebhookService.name);
  private readonly workerId = `partner-webhook-${randomUUID()}`;
  private timer?: NodeJS.Timeout;
  private draining = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (
      !this.config.get<boolean>('PARTNER_WEBHOOK_WORKER_ENABLED') ||
      this.config.get<string>('NODE_ENV') === 'test'
    ) {
      return;
    }
    const intervalMs = this.config.get<number>('PARTNER_WEBHOOK_WORKER_POLL_MS') ?? 5000;
    this.timer = setInterval(() => void this.drainOnce(), intervalMs);
    this.timer.unref();
    void this.drainOnce();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async drainOnce(): Promise<boolean> {
    if (this.draining) return false;
    this.draining = true;
    try {
      const event = await this.claimNextEvent();
      if (!event) return false;

      const client = await this.prisma.partnerApiClient.findUnique({
        where: { id: event.clientId },
      });

      if (!client || !client.webhookUrl || !client.webhookSecretReference) {
        // Nothing to deliver — mark done
        await this.prisma.partnerWebhookOutbox.update({
          where: { id: event.id },
          data: { status: 'SUCCESS', updatedAt: new Date() },
        });
        return true;
      }

      const deliveryId = randomUUID();
      const timestamp = Date.now().toString();
      const signature = createHmac('sha256', client.webhookSecretReference)
        .update(`${timestamp}\n${event.payload}`, 'utf8')
        .digest('hex');

      try {
        await firstValueFrom(
          this.http.post(client.webhookUrl, JSON.parse(event.payload as string), {
            headers: {
              'Content-Type': 'application/json',
              'X-Webhook-Delivery-Id': deliveryId,
              'X-Webhook-Timestamp': timestamp,
              'X-Webhook-Signature': signature,
              'X-Event-Type': event.eventType,
            },
            timeout: 10_000,
          }),
        );

        await this.prisma.partnerWebhookOutbox.update({
          where: { id: event.id },
          data: { status: 'SUCCESS', updatedAt: new Date() },
        });

        this.logger.debug(
          `Webhook delivered event=${event.id} type=${event.eventType} client=${event.clientId}`,
        );
      } catch (deliveryError) {
        const message =
          deliveryError instanceof Error ? deliveryError.message : 'Unknown delivery error';
        const attempts = event.attempts + 1;
        const isDeadLetter = attempts >= PARTNER_WEBHOOK_MAX_ATTEMPTS;
        const retryDelaySecs =
          PARTNER_WEBHOOK_RETRY_SCHEDULE_SECONDS[
            Math.min(attempts, PARTNER_WEBHOOK_RETRY_SCHEDULE_SECONDS.length - 1)
          ] ?? 14400;

        await this.prisma.partnerWebhookOutbox.update({
          where: { id: event.id },
          data: {
            status: isDeadLetter ? 'DEAD_LETTER' : 'FAILED',
            attempts,
            lastFailureReason: message.slice(0, 500),
            nextAttemptAt: isDeadLetter
              ? null
              : new Date(Date.now() + retryDelaySecs * 1000),
            updatedAt: new Date(),
          },
        });

        this.logger.warn(
          `Webhook delivery failed event=${event.id} type=${event.eventType} attempts=${attempts} dead=${isDeadLetter}: ${message}`,
        );
      }

      return true;
    } finally {
      this.draining = false;
    }
  }

  private async claimNextEvent() {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM partner_webhook_outbox
        WHERE status IN ('PENDING', 'FAILED')
          AND (nextAttemptAt IS NULL OR nextAttemptAt <= NOW(3))
        ORDER BY nextAttemptAt ASC, createdAt ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `;
      if (!rows[0]) return null;

      const updated = await tx.partnerWebhookOutbox.updateMany({
        where: { id: rows[0].id, status: { in: ['PENDING', 'FAILED'] } },
        data: { status: 'PROCESSING', updatedAt: new Date() },
      });
      if (updated.count !== 1) return null;

      return tx.partnerWebhookOutbox.findUnique({ where: { id: rows[0].id } });
    });
  }
}
