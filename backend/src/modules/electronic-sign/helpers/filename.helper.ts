import { randomBytes } from 'crypto';

export function generateStorageFilename(lan: string, version: string, type: 'original' | 'accepted' | 'audit'): string {
  const safeLan = String(lan || '').replace(/[^a-zA-Z0-9]/g, '');
  const safeVersion = String(version || 'v1').replace(/[^a-zA-Z0-9]/g, '');
  const rand = randomBytes(4).toString('hex');
  return `agreement-${safeLan}-${safeVersion}-${type}-${rand}.pdf`;
}
