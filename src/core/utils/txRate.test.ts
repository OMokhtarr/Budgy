import { describe, expect, it } from 'vitest';
import { formatRate, impliedRate, rateDirection, rateToSave, receivedAt, txInBase } from './txRate';
import type { Transaction } from '@/shared/models';

/** Main currency EGP, today's saved rate 1 USD = 50 EGP. */
const CONV = { base: 'EGP', toBase: (n: number, cur: string) => (cur === 'USD' ? n * 50 : n) };
const tx = (fields: Partial<Transaction>): Transaction => ({
  type: 'expense', amount: 10, currency: 'USD', accountId: 'cash', date: 'x', createdAt: 'x', ...fields,
});

describe('rateDirection', () => {
  it.each([
    ['USD', 'EGP', 'EGP', ['USD', 'EGP']],
    ['EGP', 'USD', 'EGP', ['USD', 'EGP']],
    ['USD', 'EUR', 'EGP', ['USD', 'EUR']],
  ])('%s to %s with main %s', (from, to, base, want) => {
    expect(rateDirection(from, to, base)).toEqual(want);
  });
});

describe('receivedAt', () => {
  it('multiplies when sending the unit currency', () => {
    expect(receivedAt(50, 49, 'USD', 'EGP', 'USD')).toBe(2450);
  });

  it('divides when receiving the unit currency', () => {
    expect(receivedAt(2450, 49, 'EGP', 'USD', 'USD')).toBe(50);
  });

  it('rounds to the received currency', () => {
    expect(receivedAt(100, 49, 'EGP', 'USD', 'USD')).toBe(2.04);
  });
});

describe('impliedRate', () => {
  it('reads the rate from the amounts when sending the unit currency', () => {
    expect(impliedRate(50, 2450, 'USD', 'USD')).toBe(49);
  });

  it('reads the same rate the other way round', () => {
    expect(impliedRate(2450, 50, 'EGP', 'USD')).toBe(49);
  });

  it('has no rate until both amounts are known', () => {
    expect(impliedRate(0, 2450, 'USD', 'USD')).toBeUndefined();
    expect(impliedRate(50, 0, 'USD', 'USD')).toBeUndefined();
  });
});

describe('formatRate', () => {
  it('drops the noise from a division', () => {
    expect(formatRate(100 / 3)).toBe('33.3333');
  });

  it('keeps small rates readable', () => {
    expect(formatRate(0.006191234)).toBe('0.00619123');
  });

  it('shows whole rates plainly', () => {
    expect(formatRate(50)).toBe('50');
  });
});

describe('txInBase', () => {
  it('uses the transaction\'s own rate, not today\'s', () => {
    expect(txInBase(tx({ rate: 48, rateCurrency: 'EGP' }), CONV)).toBe(480);
  });

  it('falls back to today\'s rate for a transaction without one', () => {
    expect(txInBase(tx({}), CONV)).toBe(500);
  });

  it('counts an amount already in the main currency as it is', () => {
    expect(txInBase(tx({ amount: 10, currency: 'EGP', rate: 0.02, rateCurrency: 'USD' }), CONV)).toBe(10);
  });

  it('carries the value over when the main currency has changed since', () => {
    expect(txInBase(tx({ amount: 10, currency: 'GBP', rate: 2, rateCurrency: 'USD' }), CONV)).toBe(1000);
  });
});

describe('rateToSave', () => {
  const base = 'EGP';
  const saved = 50;

  it('saves what the user typed', () => {
    expect(rateToSave({ typed: 48, saved, currency: 'USD', base })).toEqual({ rate: 48, rateCurrency: 'EGP' });
  });

  it('saves today\'s rate on a new transaction, so later changes don\'t move it', () => {
    expect(rateToSave({ saved, currency: 'USD', base })).toEqual({ rate: 50, rateCurrency: 'EGP' });
  });

  it('saves nothing for the main currency', () => {
    expect(rateToSave({ typed: 48, saved, currency: 'EGP', base })).toEqual({});
  });

  it('saves nothing when no rate is known', () => {
    expect(rateToSave({ currency: 'USD', base })).toEqual({});
  });

  it('keeps an edited transaction\'s own rate', () => {
    const editing = tx({ rate: 48, rateCurrency: 'EGP' });
    expect(rateToSave({ saved, editing, currency: 'USD', base })).toEqual({ rate: 48, rateCurrency: 'EGP' });
  });

  it('leaves an older transaction without a rate alone when its rate wasn\'t touched', () => {
    expect(rateToSave({ saved, editing: tx({}), currency: 'USD', base })).toEqual({});
  });

  it('gives an older transaction a rate once the user types one', () => {
    expect(rateToSave({ typed: 48, saved, editing: tx({}), currency: 'USD', base })).toEqual({ rate: 48, rateCurrency: 'EGP' });
  });

  it('starts from today\'s rate when the edit changes the currency', () => {
    const editing = tx({ currency: 'EUR', rate: 55, rateCurrency: 'EGP' });
    expect(rateToSave({ saved, editing, currency: 'USD', base })).toEqual({ rate: 50, rateCurrency: 'EGP' });
  });

  it('keeps the currency a typed rate was shown against', () => {
    const editing = tx({ currency: 'GBP', rate: 60, rateCurrency: 'USD' });
    expect(rateToSave({ typed: 65, saved, editing, currency: 'GBP', base })).toEqual({ rate: 65, rateCurrency: 'USD' });
  });
});
