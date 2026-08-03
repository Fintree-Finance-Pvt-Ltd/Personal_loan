import { normalizeLenderIntegrationError, redactLenderIntegrationText } from './lender-integration.errors';

describe('lender integration error safety', () => {
  it.each([429, 502, 503, 504])('classifies HTTP %s as temporary', (status) => {
    const error = normalizeLenderIntegrationError({ response: { status }, message: 'temporary' });
    expect(error.retryable).toBe(true);
    expect(error.classification).toBe('TEMPORARY');
  });

  it('redacts secrets and PAN values', () => {
    const redacted = redactLenderIntegrationText('authorization=Bearer123 api_key=secret PAN=ABCDE1234F');
    expect(redacted).not.toContain('Bearer123');
    expect(redacted).not.toContain('ABCDE1234F');
    expect(redacted).toContain('[REDACTED]');
  });

  it('redacts JSON-shaped bank and customer PII without logging complete values', () => {
    const redacted = redactLenderIntegrationText('{accountNumber:123456789012,ifsc:ABCD0123456,mobileNumber:9999999999,email:person@example.test,umrn:UMRN-1}');
    expect(redacted).not.toContain('123456789012');
    expect(redacted).not.toContain('ABCD0123456');
    expect(redacted).not.toContain('9999999999');
    expect(redacted).not.toContain('person@example.test');
    expect(redacted).not.toContain('UMRN-1');
  });
});
