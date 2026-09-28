import { createHmac } from 'crypto';
import { verifiedSessionId } from './session-tracker';

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const sign = (payload: object, secret: string, alg = 'HS256') => {
  const head = b64({ alg, typ: 'JWT' });
  const body = b64(payload);
  const signature = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${signature}`;
};

const CUSTOMER_SECRET = 'c'.repeat(40);
const ADMIN_SECRET = 'a'.repeat(40);
const secrets = [CUSTOMER_SECRET, ADMIN_SECRET];
const future = () => Math.floor(Date.now() / 1000) + 600;

describe('verifiedSessionId', () => {
  it('returns the session id of a validly signed, unexpired token - for either secret', () => {
    expect(verifiedSessionId(`Bearer ${sign({ sid: 'sess-1', exp: future() }, CUSTOMER_SECRET)}`, secrets)).toBe('sess-1');
    expect(verifiedSessionId(`Bearer ${sign({ sid: 'sess-2', exp: future() }, ADMIN_SECRET)}`, secrets)).toBe('sess-2');
  });

  it('ignores a token signed with a secret we do not know (a made-up token cannot escape the IP limit)', () => {
    expect(verifiedSessionId(`Bearer ${sign({ sid: 'sess-1', exp: future() }, 'x'.repeat(40))}`, secrets)).toBeNull();
  });

  it('ignores a token whose payload was tampered with after signing', () => {
    const [head, , signature] = sign({ sid: 'victim', exp: future() }, CUSTOMER_SECRET).split('.');
    const forged = `${head}.${b64({ sid: 'someone-else', exp: future() })}.${signature}`;
    expect(verifiedSessionId(`Bearer ${forged}`, secrets)).toBeNull();
  });

  it('ignores expired tokens and non-HS256 tokens', () => {
    expect(verifiedSessionId(`Bearer ${sign({ sid: 's', exp: Math.floor(Date.now() / 1000) - 5 }, CUSTOMER_SECRET)}`, secrets)).toBeNull();
    expect(verifiedSessionId(`Bearer ${sign({ sid: 's', exp: future() }, CUSTOMER_SECRET, 'none')}`, secrets)).toBeNull();
  });

  it('ignores missing, malformed and non-Bearer headers, and tokens without a sid', () => {
    expect(verifiedSessionId(undefined, secrets)).toBeNull();
    expect(verifiedSessionId('Basic abc', secrets)).toBeNull();
    expect(verifiedSessionId('Bearer not.a.jwt', secrets)).toBeNull();
    expect(verifiedSessionId('Bearer only-one-part', secrets)).toBeNull();
    expect(verifiedSessionId(`Bearer ${sign({ exp: future() }, CUSTOMER_SECRET)}`, secrets)).toBeNull();
    expect(verifiedSessionId(`Bearer ${sign({ sid: 's', exp: future() }, CUSTOMER_SECRET)}`, [])).toBeNull();
  });
});
