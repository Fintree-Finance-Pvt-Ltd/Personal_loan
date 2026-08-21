import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

// VAPT C5: these used to silently fall back to a hardcoded, source-visible key if the
// env vars were ever unset — "encryption" in name only for anyone with source access.
// Both are now required (see environment.ts), so a missing/misconfigured deployment
// fails loudly at startup instead of silently encrypting bank account numbers with a
// key anyone can read on GitHub.
function getEncryptionKey(): Buffer {
  const rawKey = process.env.BANK_ACCOUNT_ENCRYPTION_KEY;
  if (!rawKey) {
    throw new Error('BANK_ACCOUNT_ENCRYPTION_KEY is not configured.');
  }
  return Buffer.from(rawKey.padEnd(32, '0').slice(0, 32), 'utf-8');
}

function getHmacKey(): Buffer {
  const rawKey = process.env.BANK_ACCOUNT_HMAC_KEY;
  if (!rawKey) {
    throw new Error('BANK_ACCOUNT_HMAC_KEY is not configured.');
  }
  return Buffer.from(rawKey.padEnd(32, '0').slice(0, 32), 'utf-8');
}

export function encryptBankAccountNumber(accountNumber: string): string {
  const cleanAcc = String(accountNumber || '').trim();
  if (!cleanAcc) {
    throw new Error('Account number is empty or invalid.');
  }

  const iv = randomBytes(12); // 96-bit IV for AES-GCM
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);

  let encrypted = cipher.update(cleanAcc, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');
  const ivHex = iv.toString('hex');

  return `${ivHex}:${authTag}:${encrypted}`;
}

export function decryptBankAccountNumber(encryptedString: string): string {
  const parts = String(encryptedString || '').split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted bank account string format.');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

export function createBankAccountFingerprint(accountNumber: string): string {
  const cleanAcc = String(accountNumber || '').trim();
  return createHmac('sha256', getHmacKey())
    .update(cleanAcc)
    .digest('hex');
}

export function maskBankAccountNumber(accountNumber: string): string {
  return String(accountNumber || '').trim();
}

export function maskIfscForAudit(ifsc: string): string {
  const clean = String(ifsc || '').trim().toUpperCase();
  if (clean.length < 4) return 'XXXX';
  return `${clean.slice(0, 4)}XXXX${clean.slice(-2)}`;
}

export function encryptPayload(payload: any): string {
  const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
  if (!str) return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  let encrypted = cipher.update(str, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  const ivHex = iv.toString('hex');
  return `${ivHex}:${authTag}:${encrypted}`;
}

export function decryptPayload(encryptedString: string): string {
  if (!encryptedString) return '';
  const parts = String(encryptedString || '').split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload format.');
  }
  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

