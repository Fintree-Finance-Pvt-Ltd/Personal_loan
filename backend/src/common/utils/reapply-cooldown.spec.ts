import { evaluateReapplyCooldown, getReapplyCoolingOffDays } from './reapply-cooldown';

const day = 24 * 60 * 60 * 1000;
const now = new Date('2026-09-25T00:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * day);

describe('getReapplyCoolingOffDays', () => {
  it('defaults to 30', () => expect(getReapplyCoolingOffDays({} as any)).toBe(30));
  it('reads the configured value', () => expect(getReapplyCoolingOffDays({ REAPPLY_COOLING_OFF_DAYS: '15' } as any)).toBe(15));
  it('allows 0 to switch the wait off', () => expect(getReapplyCoolingOffDays({ REAPPLY_COOLING_OFF_DAYS: '0' } as any)).toBe(0));
  it('ignores junk and negatives', () => {
    expect(getReapplyCoolingOffDays({ REAPPLY_COOLING_OFF_DAYS: 'abc' } as any)).toBe(30);
    expect(getReapplyCoolingOffDays({ REAPPLY_COOLING_OFF_DAYS: '-5' } as any)).toBe(30);
    expect(getReapplyCoolingOffDays({ REAPPLY_COOLING_OFF_DAYS: '' } as any)).toBe(30);
  });
});

describe('evaluateReapplyCooldown', () => {
  it('blocks a rejection inside the window and reports the days left', () => {
    const r = evaluateReapplyCooldown({ status: 'PLATFORM_REJECTED', rejectedAt: daysAgo(10), coolingOffDays: 30, now });
    expect(r.active).toBe(true);
    expect(r.daysRemaining).toBe(20);
  });
  it('allows re-applying once the window has passed', () => {
    const r = evaluateReapplyCooldown({ status: 'LENDER_REJECTED', rejectedAt: daysAgo(31), coolingOffDays: 30, now });
    expect(r.active).toBe(false);
  });
  it('a smaller configured value shortens the wait', () => {
    expect(evaluateReapplyCooldown({ status: 'LENDER_REJECTED', rejectedAt: daysAgo(16), coolingOffDays: 15, now }).active).toBe(false);
  });
  it('never applies to a non-rejected application', () => {
    expect(evaluateReapplyCooldown({ status: 'LOAN_CLOSED', rejectedAt: daysAgo(1), coolingOffDays: 30, now }).active).toBe(false);
    expect(evaluateReapplyCooldown({ status: null, rejectedAt: null, coolingOffDays: 30, now }).active).toBe(false);
  });
  it('0 days disables the wait', () => {
    expect(evaluateReapplyCooldown({ status: 'PLATFORM_REJECTED', rejectedAt: daysAgo(0), coolingOffDays: 0, now }).active).toBe(false);
  });
  it('honours a longer wait requested by the lender', () => {
    const r = evaluateReapplyCooldown({
      status: 'LENDER_REJECTED', rejectedAt: daysAgo(31), lenderCoolingOffUntil: new Date(now.getTime() + 5 * day), coolingOffDays: 30, now,
    });
    expect(r.active).toBe(true);
    expect(r.daysRemaining).toBe(5);
  });
});
