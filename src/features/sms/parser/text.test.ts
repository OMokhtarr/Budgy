import { describe, expect, it } from 'vitest';
import { currencyOf, findAmounts, findDigits } from './text';

describe('findAmounts', () => {
  it('normalizes Arabic-Indic amounts', () => {
    expect(findAmounts('تم خصم مبلغ ٣٢٠٫٥٠ ج.م')[0]).toMatchObject({ amount: 320.5, currency: 'EGP' });
    expect(findAmounts('بمبلغ ١٢٬٠٠٠ جنيه')[0]).toMatchObject({ amount: 12000, currency: 'EGP' });
  });
  it('reads thousands separators', () => {
    expect(findAmounts('credited with 12,000.00 EGP')[0]).toMatchObject({ amount: 12000, currency: 'EGP' });
    expect(findAmounts('EGP 450.00 at X')[0]).toMatchObject({ amount: 450, currency: 'EGP' });
    expect(findAmounts('USD20.5')[0]).toMatchObject({ amount: 20.5, currency: 'USD' });
  });
  it('lists every amount in order', () => {
    expect(findAmounts('debited EGP 450.00. Available balance EGP 5,000.00').map((a) => a.amount)).toEqual([450, 5000]);
  });
  it('does not read masked digits or dates as amounts', () => {
    expect(findAmounts('card **4821 on 03/11/2026')).toEqual([]);
  });
});

describe('findDigits', () => {
  it('finds masked digits', () => {
    expect(findDigits('Your card **4821 was')).toBe('4821');
    expect(findDigits('account xx1234 credited')).toBe('1234');
    expect(findDigits('card ending with 7781')).toBe('7781');
    expect(findDigits('من حسابكم رقم ****٧٧٨١')).toBe('7781');
    expect(findDigits('no digits here')).toBeUndefined();
    expect(findDigits('from **9999 to **1234', 'in')).toBe('1234');
    expect(findDigits('from **9999 to **1234', 'out')).toBe('9999');
  });
});

describe('currencyOf', () => {
  it('maps currency aliases', () => {
    expect(currencyOf('L.E')).toBe('EGP');
    expect(currencyOf('ج.م')).toBe('EGP');
    expect(currencyOf('usd')).toBe('USD');
    expect(currencyOf('XYZ')).toBeUndefined();
  });
});
