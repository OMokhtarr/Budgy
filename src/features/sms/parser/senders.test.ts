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
  it('matches a phrase split by a line break or extra spaces', () => {
    expect(containsKeyword('Special\noffer for you', ['special offer'])).toBe(true);
    expect(containsKeyword('Special   offer', ['special offer'])).toBe(true);
  });
  it('matches Arabic written with vowel marks, tatweel or another alef', () => {
    expect(containsKeyword('عَرْض خاص', ['عرض'])).toBe(true);
    expect(containsKeyword('عــرض خاص', ['عرض'])).toBe(true);
    expect(containsKeyword('إعلان جديد', ['اعلان'])).toBe(true);
    expect(containsKeyword('اعلان جديد', ['إعلان'])).toBe(true);
  });
});

describe('normalizeKeyword', () => {
  it('trims and collapses spaces', () => expect(normalizeKeyword('  Bank   Misr ')).toBe('Bank Misr'));
});
