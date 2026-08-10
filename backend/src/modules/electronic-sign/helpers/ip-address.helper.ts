import { Request } from 'express';

export function extractClientIp(req: Request): { ipAddress: string; forwardedFor: string } {
  const forwarded = req.headers['x-forwarded-for'];
  const forwardedFor = Array.isArray(forwarded) ? forwarded.join(', ') : forwarded || '';
  const ipAddress = req.ip || (forwardedFor ? forwardedFor.split(',')[0].trim() : '127.0.0.1');

  return {
    ipAddress: ipAddress.slice(0, 45),
    forwardedFor: forwardedFor.slice(0, 1000),
  };
}
