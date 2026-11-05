import { describe, expect, it } from 'vitest';
import { assetsAndDebts } from './finances';
import type { Account, Amounts } from '@/shared/models';

const account = (id: string, fields: Partial<Account> = {}): Account => ({
  id, name: id, type: 'cash', icon: 'cash', color: '#111', currency: 'EGP', initialBalance: 0, order: 0, createdAt: 'x', ...fields,
});
const IN = account('in', { defaultFor: 'income' });
const OUT = account('out', { defaultFor: 'expense' });
const run = (accounts: Account[], balances: Record<string, Amounts>) => assetsAndDebts(accounts, new Map(Object.entries(balances)));

describe('assetsAndDebts', () => {
  it('combines the default accounts into what is left, keeping a debt owed to you as an asset', () => {
    const r = run([IN, OUT, account('cib', { group: 'debt' })], { in: { EGP: 1338839.5 }, out: { EGP: -1333875.48 }, cib: { EGP: 20585 } });
    expect(r).toEqual({ assets: { EGP: 25549.02 }, debts: {} });
  });

  it('shows a shortfall as a debt when more went out than came in', () => {
    expect(run([IN, OUT], { in: { EGP: 100 }, out: { EGP: -130 } })).toEqual({ assets: {}, debts: { EGP: 30 } });
  });

  it('shows neither side when in and out cancel exactly', () => {
    expect(run([IN, OUT], { in: { EGP: 0.3 }, out: { EGP: -0.3 } })).toEqual({ assets: {}, debts: {} });
  });

  it('leaves other accounts on their own side', () => {
    const r = run([account('bank'), account('loan', { group: 'debt' })], { bank: { EGP: 500 }, loan: { EGP: -200 } });
    expect(r).toEqual({ assets: { EGP: 500 }, debts: { EGP: 200 } });
  });

  it('does not offset a real debt against the combined accounts', () => {
    const r = run([IN, OUT, account('loan', { group: 'debt' })], { in: { EGP: 100 }, out: { EGP: -40 }, loan: { EGP: -25 } });
    expect(r).toEqual({ assets: { EGP: 60 }, debts: { EGP: 25 } });
  });

  it('combines each currency separately', () => {
    const r = run([IN, { ...OUT, currency2: 'USD' }], { in: { EGP: 100 }, out: { EGP: -40, USD: -5 } });
    expect(r).toEqual({ assets: { EGP: 60 }, debts: { USD: 5 } });
  });

  it('treats an account with no balances yet as zero', () => {
    expect(run([IN, account('bank')], {})).toEqual({ assets: {}, debts: {} });
  });
});
