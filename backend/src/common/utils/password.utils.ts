const COMMON_PASSWORD_FRAGMENTS = [
  'password',
  'qwerty',
  'letmein',
  'welcome',
  'admin123',
  '12345678',
  'iloveyou',
];

export function validatePasswordStrength(password: string): string[] {
  const errors: string[] = [];
  if (password.length < 12) errors.push('must be at least 12 characters');
  if (password.length > 128) errors.push('must be at most 128 characters');
  if (!/[A-Z]/.test(password)) errors.push('must contain an uppercase letter');
  if (!/[a-z]/.test(password)) errors.push('must contain a lowercase letter');
  if (!/\d/.test(password)) errors.push('must contain a number');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('must contain a special character');
  if (COMMON_PASSWORD_FRAGMENTS.some((item) => password.toLowerCase().includes(item))) {
    errors.push('is too common');
  }
  return errors;
}
