import { describe, expect, it } from 'vitest';
import { headerCurrencies } from './currency';
import type { Account } from '@/shared/models';

const account = (currency: string, currency2?: string): Account => ({
  name: currency, type: 'bank', icon: 'card', color: '#111', currency, currency2, initialBalance: 0, order: 0, createdAt: 'x',
});

describe('headerCurrencies', () => {
  it("shows one account in its own currencies, its main one first", () => {
    expect(headerCurrencies([account('USD')], 'EGP')).toEqual(['USD']);
    expect(headerCurrencies([account('USD', 'EGP')], 'EGP')).toEqual(['USD', 'EGP']);
  });

  it('shows several accounts with a two-currency one in every currency they hold, the main currency first', () => {
    expect(headerCurrencies([account('USD'), account('EGP'), account('EUR', 'USD')], 'EGP')).toEqual(['EGP', 'USD', 'EUR']);
  });

  it("doesn't put the main currency first when none of the accounts holds it", () => {
    expect(headerCurrencies([account('USD', 'EUR'), account('USD')], 'EGP')).toEqual(['USD', 'EUR']);
  });

  it('converts several accounts to the main currency when none of them holds two', () => {
    expect(headerCurrencies([account('USD'), account('EGP')], 'EGP')).toBeUndefined();
  });

  it('converts when no account is chosen', () => {
    expect(headerCurrencies([], 'EGP')).toBeUndefined();
  });
});
