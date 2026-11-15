import { describe, expect, it } from 'vitest';
import { guessCurrency } from './currencyGuess';

describe('guessCurrency', () => {
  it('guesses from the region', () => expect(guessCurrency('ar-SA', 'EGP')).toBe('SAR'));
  it('euro countries map to EUR', () => expect(guessCurrency('de-DE', 'EGP')).toBe('EUR'));
  it('no region or unknown region keeps the fallback', () => {
    expect(guessCurrency('en', 'EGP')).toBe('EGP');
    expect(guessCurrency('xx-ZZ', 'USD')).toBe('USD');
  });
});
