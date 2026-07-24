import { hmacHex, maskEmail, maskIp, normalizeEmail, sanitizeObject } from '../src/common/utils/security.utils';
import { validatePasswordStrength } from '../src/common/utils/password.utils';

describe('security utilities', () => {
  it('normalizes email before lookup and storage', () => {
    expect(normalizeEmail(' Admin@Example.COM ')).toBe('admin@example.com');
  });

  it('masks email addresses in login records', () => {
    expect(maskEmail('admin@example.com')).toBe('ad***@example.com');
  });

  it('masks IPv4 and IPv6 session values', () => {
    expect(maskIp('203.0.113.55')).toBe('203.0.x.x');
    expect(maskIp('2001:db8:1234:5678::1')).toBe('2001:db8:1234:…');
  });

  it('creates deterministic keyed token hashes without retaining the token', () => {
    const token = 'raw-refresh-token';
    const hash = hmacHex(token, 'a-key-long-enough-for-a-test-environment');
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(token);
    expect(hash).toBe(hmacHex(token, 'a-key-long-enough-for-a-test-environment'));
  });

  it('sanitizes audit and security metadata recursively', () => {
    expect(sanitizeObject({
      action: 'USER_UPDATED',
      password: 'never-log-this',
      nested: { pan: 'ABCDE1234F', safe: 'kept' },
    })).toEqual({
      action: 'USER_UPDATED',
      password: '[REDACTED]',
      nested: { pan: '[REDACTED]', safe: 'kept' },
    });
  });

  it('rejects weak and common passwords', () => {
    expect(validatePasswordStrength('Password123!')).toContain('is too common');
    expect(validatePasswordStrength('short')).toHaveLength(4);
  });

  it('accepts a strong password without trimming it', () => {
    expect(validatePasswordStrength('V3ry-Str0ng-Phrase!')).toEqual([]);
    expect(validatePasswordStrength(' V3ry-Str0ng-Phrase! ')).toEqual([]);
  });
});
