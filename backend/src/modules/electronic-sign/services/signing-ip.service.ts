import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isIP } from 'net';

export interface SigningIpEvidence {
  clientIp: string;
  forwardedFor: string | null;
  socketIp: string | null;
  xRealIp: string | null;
  environment: 'LOCAL' | 'UAT' | 'PRODUCTION';
  isLoopback: boolean;
  isPrivate: boolean;
  isPublic: boolean;
  proxyHopCount: number;
  capturedAt: Date;
}

@Injectable()
export class SigningIpService {
  private readonly logger = new Logger(SigningIpService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Normalizes IP string (removes IPv4-mapped prefix, brackets, converts ::1 to 127.0.0.1)
   */
  normalizeIp(value: unknown): string {
    if (!value || typeof value !== 'string') return '';
    let ip = value.trim();

    // Remove surrounding brackets if present e.g. [2401:4900:abcd::1]
    if (ip.startsWith('[') && ip.endsWith(']')) {
      ip = ip.slice(1, -1).trim();
    }

    // Strip IPv4-mapped IPv6 prefix e.g. ::ffff:59.184.156.184
    if (ip.toLowerCase().startsWith('::ffff:')) {
      ip = ip.slice(7).trim();
    }

    // Convert IPv6 loopback to IPv4 standard string
    if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') {
      return '127.0.0.1';
    }

    if (isIP(ip) === 0) {
      return '';
    }

    return ip;
  }

  /**
   * Checks if an IP is loopback
   */
  isLoopbackIp(ip: string): boolean {
    const norm = this.normalizeIp(ip);
    if (!norm) return false;
    return norm === '127.0.0.1' || norm.startsWith('127.');
  }

  /**
   * Checks if an IP is private/reserved
   */
  isPrivateIp(ip: string): boolean {
    const norm = this.normalizeIp(ip);
    if (!norm) return true;

    if (this.isLoopbackIp(norm)) return true;

    const version = isIP(norm);
    if (version === 4) {
      const parts = norm.split('.').map(Number);
      if (parts.length !== 4) return true;

      const [a, b] = parts;

      // 10.0.0.0/8
      if (a === 10) return true;
      // 172.16.0.0/12
      if (a === 172 && b >= 16 && b <= 31) return true;
      // 192.168.0.0/16
      if (a === 192 && b === 168) return true;
      // 169.254.0.0/16
      if (a === 169 && b === 254) return true;
      // 0.0.0.0/8
      if (a === 0) return true;
      // 100.64.0.0/10 (CGNAT)
      if (a === 100 && b >= 64 && b <= 127) return true;
      // 224.0.0.0/4 (Multicast)
      if (a >= 224 && a <= 239) return true;
      // 240.0.0.0/4 (Reserved)
      if (a >= 240) return true;

      return false;
    }

    if (version === 6) {
      const lower = norm.toLowerCase();
      if (lower === '::' || lower === '0:0:0:0:0:0:0:0') return true;
      // Unique Local Addresses fc00::/7
      if (/^(fc|fd)/i.test(lower)) return true;
      // Link-Local Addresses fe80::/10
      if (/^fe[89ab]/i.test(lower)) return true;
      // Multicast ff00::/8
      if (/^ff/i.test(lower)) return true;

      return false;
    }

    return true;
  }

  /**
   * Checks if an IP is a valid public IP
   */
  isPublicIp(ip: string): boolean {
    const norm = this.normalizeIp(ip);
    if (!norm) return false;
    return isIP(norm) !== 0 && !this.isPrivateIp(norm);
  }

  /**
   * Captures and validates environment-aware IP evidence from Nest/Express HTTP Request
   */
  capture(req: any): SigningIpEvidence {
    const capturedAt = new Date();

    // 1. Diagnostics: X-Forwarded-For header
    const rawForwarded = req.headers?.['x-forwarded-for'];
    const forwardedForStr = Array.isArray(rawForwarded)
      ? rawForwarded.join(', ')
      : typeof rawForwarded === 'string'
        ? rawForwarded
        : null;

    let proxyHopCount = 0;
    if (forwardedForStr) {
      proxyHopCount = forwardedForStr.split(',').length;
    }

    // 2. Diagnostics: X-Real-IP header
    const rawXRealIp = req.headers?.['x-real-ip'];
    const xRealIpStr = Array.isArray(rawXRealIp)
      ? rawXRealIp[0]
      : typeof rawXRealIp === 'string'
        ? rawXRealIp
        : null;
    const xRealIp = this.normalizeIp(xRealIpStr) || null;

    // 3. Diagnostics: Socket Remote Address
    const socketAddress = req.socket?.remoteAddress || req.connection?.remoteAddress || null;
    const socketIp = this.normalizeIp(socketAddress) || null;

    // 4. Primary Resolved Client IP (Express req.ip evaluated via trusted proxy setting)
    let rawClientIp = req.ip || xRealIp || socketIp || '127.0.0.1';
    let clientIp = this.normalizeIp(rawClientIp);

    if (!clientIp) {
      clientIp = socketIp || '127.0.0.1';
    }

    const isLoopback = this.isLoopbackIp(clientIp);
    const isPrivate = this.isPrivateIp(clientIp);
    const isPublic = this.isPublicIp(clientIp);

    // Environment Flags
    const requirePublic =
      this.configService.get<boolean>('ELECTRONIC_SIGN_REQUIRE_PUBLIC_IP') ??
      (process.env.NODE_ENV === 'production');

    const nodeEnv = process.env.NODE_ENV || 'development';

    let environment: 'LOCAL' | 'UAT' | 'PRODUCTION' = 'LOCAL';
    if (nodeEnv === 'production') {
      const appEnv = (process.env.APP_ENV || process.env.STAGE || 'UAT').toUpperCase();
      environment = appEnv.includes('PROD') ? 'PRODUCTION' : 'UAT';
    } else if (requirePublic) {
      environment = 'UAT';
    }

    // Safe Diagnostic Log
    this.logger.log({
      event: 'ELECTRONIC_SIGN_IP_CAPTURE',
      resolvedIp: clientIp,
      socketIp: socketIp || 'N/A',
      forwardedForPresent: Boolean(forwardedForStr),
      environment,
      isPublic,
    });

    // UAT / Production Enforcement
    if (requirePublic && !isPublic) {
      this.logger.warn(
        `Rejected non-public IP (${clientIp}) in ${environment} environment during eSign OTP verification.`,
      );
      throw new ServiceUnavailableException(
        'Unable to capture a valid public signing IP address. Please try again.',
      );
    }

    return {
      clientIp,
      forwardedFor: forwardedForStr ? forwardedForStr.slice(0, 1000) : null,
      socketIp,
      xRealIp,
      environment,
      isLoopback,
      isPrivate,
      isPublic,
      proxyHopCount,
      capturedAt,
    };
  }
}
