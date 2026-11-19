import { describe, expect, it } from 'vitest';
import { containsKeyword, matchesSender, normalizeKeyword } from './senders';

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

describe('containsKeyword', () => {
  it('finds a word anywhere in the text, ignoring case', () => {
    expect(containsKeyword('Get 20% OFF now', ['off'])).toBe(true);
    expect(containsKeyword('Your card was debited', ['promo'])).toBe(false);
  });
  it('matches Arabic words', () => expect(containsKeyword('عرض خاص لعملائنا', ['عرض'])).toBe(true));
  it('never matches a blank word', () => expect(containsKeyword('x', ['  '])).toBe(false));
});

describe('normalizeKeyword', () => {
  it('trims and collapses spaces', () => expect(normalizeKeyword('  Bank   Misr ')).toBe('Bank Misr'));
});
