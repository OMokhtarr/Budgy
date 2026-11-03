import { describe, expect, it } from 'vitest';
import { parseNumber } from './number';

describe('parseNumber', () => {
  it('reads Arabic digits and decimal comma', () => {
    expect(parseNumber('٣٢٠٫٥')).toBe(320.5);
    expect(parseNumber('12,000')).toBe(12000);
    expect(parseNumber('48,5')).toBe(48.5);
  });
});
