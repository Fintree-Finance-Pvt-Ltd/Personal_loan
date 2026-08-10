// ──────────────────────────────────────────────────────────────────────────
// Partner API – HMAC SHA-256 Authentication Guard
// ──────────────────────────────────────────────────────────────────────────
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual, createHmac, createHash } from 'crypto';
import { Request } from 'express';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PARTNER_HMAC_TIMESTAMP_TOLERANCE_SECONDS } from './partner-api.constants';
import { PartnerApiError } from './partner-api.errors';

export const PARTNER_CLIENT_CONTEXT_KEY = 'partnerClient';

@Injectable()
export class PartnerAuthGuard implements CanActivate {
  private readonly logger = new Logger(PartnerAuthGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();

    const clientId = req.headers['x-client-id'] as string | undefined;
    const timestamp = req.headers['x-request-timestamp'] as string | undefined;
    const nonce = req.headers['x-nonce'] as string | undefined;
    const signature = req.headers['x-signature'] as string | undefined;

    if (!clientId || !timestamp || !nonce || !signature) {
      throw new UnauthorizedException(
        'PARTNER_AUTH_MISSING_HEADER: Required authentication headers are missing.',
      );
    }

    // ── 1. Resolve client ─────────────────────────────────────────────────
    const client = await this.prisma.partnerApiClient.findUnique({ where: { clientId } });
    if (!client) {
      throw new UnauthorizedException('PARTNER_AUTH_CLIENT_NOT_FOUND: Client not found.');
    }
    if (client.status !== 'ACTIVE') {
      throw new UnauthorizedException('PARTNER_AUTH_CLIENT_INACTIVE: Client is inactive.');
    }

    // ── 2. IP allow-list ──────────────────────────────────────────────────
    if (client.allowedIpAddresses) {
      const allowed = client.allowedIpAddresses.split(',').map((ip) => ip.trim());
      const remoteIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket.remoteAddress ||
        '';
      if (!allowed.includes(remoteIp)) {
        this.logger.warn(
          `Partner auth IP rejected client=${clientId} ip=${remoteIp}`,
        );
        throw new UnauthorizedException(
          'PARTNER_AUTH_IP_NOT_ALLOWED: Request origin IP is not on the allow-list.',
        );
      }
    }

    // ── 3. Timestamp freshness ─────────────────────────────────────────────
    const tsMs = Number(timestamp);
    if (isNaN(tsMs)) {
      throw new UnauthorizedException(
        'PARTNER_AUTH_TIMESTAMP_EXPIRED: X-Request-Timestamp must be a Unix millisecond timestamp.',
      );
    }
    const deltaSeconds = Math.abs(Date.now() - tsMs) / 1000;
    if (deltaSeconds > PARTNER_HMAC_TIMESTAMP_TOLERANCE_SECONDS) {
      throw new UnauthorizedException(
        `PARTNER_AUTH_TIMESTAMP_EXPIRED: Request timestamp is ${Math.round(deltaSeconds)}s old.`,
      );
    }

    // ── 4. Nonce uniqueness (replay prevention) ───────────────────────────
    const nonceExpiry = new Date(Date.now() + PARTNER_HMAC_TIMESTAMP_TOLERANCE_SECONDS * 1000 * 2);
    try {
      await this.prisma.partnerApiNonce.create({
        data: {
          clientId: client.id,
          nonce,
          expiresAt: nonceExpiry,
        },
      });
    } catch {
      // Unique constraint violation → replayed nonce
      throw new UnauthorizedException(
        'PARTNER_AUTH_NONCE_REPLAYED: This nonce has already been used.',
      );
    }

    // ── 5. Signature verification (constant-time) ─────────────────────────
    const rawBody: string =
      (((req as unknown) as { rawBody?: string | Buffer }).rawBody)?.toString('utf8') ?? '';
    const bodyHash = createHash('sha256').update(rawBody, 'utf8').digest('hex');
    const signingString = `${clientId}\n${timestamp}\n${nonce}\n${bodyHash}`;

    const expectedHmac = createHmac('sha256', client.secretReference)
      .update(signingString, 'utf8')
      .digest('hex');

    let equal = false;
    try {
      equal = timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedHmac, 'hex'),
      );
    } catch {
      equal = false;
    }

    if (!equal) {
      throw new UnauthorizedException(
        'PARTNER_AUTH_SIGNATURE_INVALID: HMAC signature verification failed.',
      );
    }

    // ── Attach resolved client to request context ─────────────────────────
    ((req as unknown) as Record<string, unknown>)[PARTNER_CLIENT_CONTEXT_KEY] = client;
    return true;
  }
}
