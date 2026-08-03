// ──────────────────────────────────────────────────────────────────────────
// Partner API – Idempotency Interceptor
// ──────────────────────────────────────────────────────────────────────────
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Logger,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PARTNER_CLIENT_CONTEXT_KEY } from './partner-auth.guard';
import { PARTNER_IDEMPOTENCY_HEADER } from './partner-api.constants';

type AnyRecord = Record<string, unknown>;

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    // Only enforce on state-mutating methods
    if (!['POST', 'PUT', 'PATCH'].includes(req.method.toUpperCase())) {
      return next.handle();
    }

    const idempotencyKey = req.headers[PARTNER_IDEMPOTENCY_HEADER.toLowerCase()] as string | undefined;
    if (!idempotencyKey) {
      res.status(422).json({
        error: 'PARTNER_IDEMPOTENCY_KEY_MISSING',
        message: `The '${PARTNER_IDEMPOTENCY_HEADER}' header is required for this request.`,
      });
      return of(null);
    }

    const client = ((req as unknown) as AnyRecord)[PARTNER_CLIENT_CONTEXT_KEY] as { id: string } | undefined;
    if (!client) {
      return next.handle();
    }

    const rawBody = (((req as unknown) as AnyRecord).rawBody as Buffer | string | undefined)?.toString('utf8') ?? '';
    const requestHash = createHash('sha256').update(rawBody, 'utf8').digest('hex');
    const endpoint = req.path;

    // ── Check for existing record ─────────────────────────────────────────
    const existing = await this.prisma.partnerApiIdempotencyRecord.findUnique({
      where: {
        clientId_idempotencyKey: { clientId: client.id, idempotencyKey },
      },
    });

    if (existing) {
      if (existing.requestHash !== requestHash) {
        res.status(409).json({
          error: 'PARTNER_IDEMPOTENCY_CONFLICT',
          message:
            'This Idempotency-Key was already used with a different request payload. Use a new key for a different request.',
        });
        return of(null);
      }
      // Same payload → replay cached response
      this.logger.debug(`Idempotency replay key=${idempotencyKey} client=${client.id}`);
      res.status(existing.responseStatus).set('X-Idempotency-Replayed', 'true');
      const body = JSON.parse(existing.responseBody) as unknown;
      return of(body);
    }

    // ── No record yet – execute and persist ───────────────────────────────
    return next.handle().pipe(
      tap({
        next: async (responseBody: unknown) => {
          try {
            const status = res.statusCode;
            await this.prisma.partnerApiIdempotencyRecord.create({
              data: {
                clientId: client.id,
                idempotencyKey,
                endpoint,
                requestHash,
                responseStatus: status,
                responseBody: JSON.stringify(responseBody),
              },
            });
          } catch (err) {
            this.logger.warn(`Idempotency record store failed key=${idempotencyKey}: ${(err as Error).message}`);
          }
        },
      }),
    );
  }
}
