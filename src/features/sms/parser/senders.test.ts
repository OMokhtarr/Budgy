import { describe, expect, it } from 'vitest';
import { matchesSender, normalizeKeyword } from './senders';

describe('matchesSender', () => {
  it('matches partial names ignoring case', () => {
    expect(matchesSender('CIB', ['cib'])).toBe(true);
    expect(matchesSender('Bank-AlAhly', ['bank'])).toBe(true);
    expect(matchesSender('NBE-Alerts', ['Bank-AlAhly'])).toBe(false);
  });
  it('ignores blank keywords and trims', () => {
    expect(matchesSender('Vodafone', ['', '  '])).toBe(false);
    expect(matchesSender('CIB', ['  cib '])).toBe(true);
  });
});

describe('normalizeKeyword', () => {
  it('trims and collapses spaces', () => expect(normalizeKeyword('  Bank   Misr ')).toBe('Bank Misr'));
});
