import { matchNames, namesLikelyMatch } from './name-matcher.helper';

describe('name-matcher.helper', () => {
  it('scores identical names at 100', () => {
    expect(matchNames('VISHAL RAMASHANKAR YADAV', 'Vishal Ramashankar Yadav')).toBe(100);
  });

  it('tolerates an honorific prefix', () => {
    expect(matchNames('MORDE VIJAY CHANDRAKANT', 'Mr. MORDE VIJAY CHANDRAKANT')).toBeGreaterThanOrEqual(90);
  });

  it('tolerates reordered tokens (first/last swapped)', () => {
    expect(matchNames('Lalit Amulakh Shah', 'Shah Lalit Amulakh')).toBe(100);
  });

  it('scores a genuinely different name low', () => {
    const score = matchNames('Rajesh Kumar Sharma', 'Priya Singh Verma');
    expect(score).toBeLessThan(50);
  });

  it('treats a middle/last name collapsed to an initial as a match', () => {
    // Real production case: bank record has the surname abbreviated to an initial.
    expect(matchNames('Rammaya P', 'Rammaya Pandit')).toBeGreaterThanOrEqual(85);
  });

  it('treats an initial plus a minor spelling variant together as a match', () => {
    // Real production case: middle name collapsed to an initial AND a one-letter
    // transliteration difference in the surname (Sonanwane vs Sonawane).
    expect(matchNames('Pratik A Sonanwane', 'Pratik Ashok Sonawane')).toBeGreaterThanOrEqual(85);
  });

  it('does not let a bare initial match an unrelated name', () => {
    const score = matchNames('Rammaya P', 'Suresh Kumar');
    expect(score).toBeLessThan(50);
  });

  it('treats an empty name as no match', () => {
    expect(matchNames('', 'Rajesh Kumar')).toBe(0);
    expect(matchNames(null, undefined)).toBe(0);
  });

  it('namesLikelyMatch respects the threshold', () => {
    expect(namesLikelyMatch('Pinki Lalit Shah', 'PINKI LALIT SHAH', 70).matched).toBe(true);
    expect(namesLikelyMatch('Rajesh Kumar', 'Suresh Kumar', 90).matched).toBe(false);
  });
});
