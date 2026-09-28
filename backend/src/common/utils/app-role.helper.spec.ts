import { getAppRole, runsBackgroundWork } from './app-role.helper';

const configWith = (role?: string) => ({ get: jest.fn(() => role) }) as any;

describe('app role', () => {
  it('defaults to "all" so leaving APP_ROLE unset changes nothing', () => {
    expect(getAppRole(configWith(undefined))).toBe('all');
    expect(runsBackgroundWork(configWith(undefined))).toBe(true);
  });

  it('treats anything unrecognised as "all" rather than silently disabling background work', () => {
    expect(getAppRole(configWith('primary'))).toBe('all');
    expect(runsBackgroundWork(configWith(''))).toBe(true);
  });

  it('only a pure api process skips background work', () => {
    expect(runsBackgroundWork(configWith('api'))).toBe(false);
    expect(runsBackgroundWork(configWith('worker'))).toBe(true);
    expect(runsBackgroundWork(configWith('all'))).toBe(true);
  });
});
