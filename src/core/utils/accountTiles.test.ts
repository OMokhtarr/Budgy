import { describe, expect, it } from 'vitest';
import { tileIsSpending } from './accountFilter';
import { everydayShiftsOf, spentOnTile, tileMoveOf } from './accountTiles';
import type { Account, AccountGroup, Transaction } from '@/shared/models';

const tx = (fields: Partial<Transaction>): Transaction => ({
  type: 'transfer', amount: 100, currency: 'EGP', accountId: 'cash', toAccountId: 'debt', date: 'x', createdAt: 'x', ...fields,
});
const SCOPE = { tileIds: new Set(['debt', 'savings']), everydayIds: new Set(['cash', 'bank']), shownIds: new Set(['cash', 'bank', 'debt', 'savings']) };
/** 1 USD = 50 EGP; everything else is already in the main currency. */
const CONV = { base: 'EGP', toBase: (n: number, cur: string) => (cur === 'USD' ? n * 50 : n) };
const spent = (fields: Partial<Transaction>, scope = SCOPE) => spentOnTile(tx(fields), scope, CONV);

describe('tileIsSpending', () => {
  it.each<[AccountGroup | undefined, boolean]>([
    ['debt', true],
    ['savings', true],
    ['regular', false],
    [undefined, false],
  ])('group %s: %s', (group, want) => {
    expect(tileIsSpending({ group } as Account)).toBe(want);
  });
});

describe('spentOnTile', () => {
  it('counts money sent to a tile', () => {
    expect(spent({})).toBe(100);
  });

  it('takes away money coming back from a tile', () => {
    expect(spent({ accountId: 'debt', toAccountId: 'cash' })).toBe(-100);
  });

  it('values money sent by what left the other account', () => {
    expect(spent({ amount: 5000, toAmount: 100, toCurrency: 'USD' })).toBe(5000);
  });

  it('values money coming back by what reached the other account', () => {
    expect(spent({ accountId: 'debt', toAccountId: 'cash', amount: 100, currency: 'USD', toAmount: 4900, toCurrency: 'EGP' })).toBe(-4900);
  });

  it('values foreign money sent by what arrived in the main currency, not at today\'s rate', () => {
    expect(spent({ amount: 100, currency: 'USD', toAmount: 4900, toCurrency: 'EGP' })).toBe(4900);
  });

  it('values foreign money coming back by what left in the main currency, not at today\'s rate', () => {
    expect(spent({ accountId: 'debt', toAccountId: 'cash', amount: 4900, toAmount: 100, toCurrency: 'USD' })).toBe(-4900);
  });

  it('uses today\'s rate when neither side is in the main currency', () => {
    expect(spent({ amount: 100, currency: 'USD', toAmount: 92, toCurrency: 'EUR' })).toBe(5000);
  });

  it.each<[string, Partial<Transaction>]>([
    ['an expense paid from the tile', { type: 'expense', accountId: 'debt', toAccountId: undefined }],
    ['income received into the tile', { type: 'income', accountId: 'debt', toAccountId: undefined }],
    ['an expense from an everyday account', { type: 'expense', toAccountId: undefined }],
    ['a transfer between two tiles', { accountId: 'savings', toAccountId: 'debt' }],
    ['a transfer inside one tile', { accountId: 'debt', toAccountId: 'debt', toCurrency: 'USD', toAmount: 2 }],
    ['a transfer between accounts without tiles', { toAccountId: 'other' }],
    ['a transfer between two everyday accounts', { toAccountId: 'bank' }],
  ])('ignores %s', (_name, fields) => {
    expect(spent(fields)).toBe(0);
  });

  it('ignores money moving to or from an account left out of the filter', () => {
    const scope = { ...SCOPE, shownIds: new Set(['debt', 'savings']) };
    expect(spent({}, scope)).toBe(0);
    expect(spent({ accountId: 'debt', toAccountId: 'cash' }, scope)).toBe(0);
  });
});

describe('spentOnTile for a debt', () => {
  /** 'debt' is a debt account: of these transfers, t-lend was all lending, t-half half, t-loan none. */
  const LENDING = { ...SCOPE, lending: new Map([['debt', new Map([['t-lend', 1], ['t-half', 0.5], ['t-loan', 0]])]]) };

  it('counts all of a loan you give', () => {
    expect(spent({ id: 't-lend' }, LENDING)).toBe(100);
  });

  it('counts only the part that was lending or getting it back', () => {
    expect(spent({ id: 't-half', amount: 5000, toAmount: 100, toCurrency: 'USD' }, LENDING)).toBe(2500);
    expect(spent({ id: 't-half', accountId: 'debt', toAccountId: 'cash' }, LENDING)).toBe(-50);
  });

  it('ignores borrowing and paying a loan back', () => {
    expect(spent({ id: 't-loan', accountId: 'debt', toAccountId: 'cash' }, LENDING)).toBe(0);
    expect(spent({ id: 't-loan' }, LENDING)).toBe(0);
  });

  it('ignores a debt transfer it knows nothing about yet', () => {
    expect(spent({ id: 't-new' }, LENDING)).toBe(0);
  });

  it('still counts everything sent to savings', () => {
    expect(spent({ id: 't-loan', toAccountId: 'savings' }, LENDING)).toBe(100);
  });

  it('shows only the lending part on the tile', () => {
    expect(tileMoveOf(tx({ id: 't-half', amount: 5000, toAmount: 100, toCurrency: 'USD' }), LENDING)?.onTile).toEqual([50, 'USD']);
  });
});

describe('tileMoveOf', () => {
  it('shows money sent in the currency that arrived on the tile', () => {
    expect(tileMoveOf(tx({ amount: 5000, toAmount: 100, toCurrency: 'USD' }), SCOPE)?.onTile).toEqual([100, 'USD']);
  });

  it('shows money coming back in the currency that left the tile', () => {
    const move = tileMoveOf(tx({ accountId: 'debt', toAccountId: 'cash', amount: 100, currency: 'USD', toAmount: 4900, toCurrency: 'EGP' }), SCOPE);
    expect(move).toMatchObject({ tileId: 'debt', sign: -1, onTile: [100, 'USD'] });
  });
});

describe('everydayShiftsOf', () => {
  const shifts = (fields: Partial<Transaction>) => everydayShiftsOf(tx(fields), SCOPE);

  it('shows money moved between two everyday accounts on both tiles', () => {
    expect(shifts({ toAccountId: 'bank', amount: 1000 })).toEqual([
      { tileId: 'bank', sign: 1, onTile: [1000, 'EGP'] },
      { tileId: 'cash', sign: -1, onTile: [1000, 'EGP'] },
    ]);
  });

  it('shows money sent to savings as leaving the everyday account', () => {
    expect(shifts({ toAccountId: 'savings' })).toEqual([{ tileId: 'cash', sign: -1, onTile: [100, 'EGP'] }]);
  });

  it('shows money coming back from a debt in the currency that reached the everyday account', () => {
    expect(shifts({ accountId: 'debt', toAccountId: 'cash', amount: 100, currency: 'USD', toAmount: 4900, toCurrency: 'EGP' })).toEqual([
      { tileId: 'cash', sign: 1, onTile: [4900, 'EGP'] },
    ]);
  });

  it.each<[string, Partial<Transaction>]>([
    ['an expense', { type: 'expense', toAccountId: undefined }],
    ['an exchange inside one account', { toAccountId: 'cash', toCurrency: 'USD', toAmount: 2 }],
    ['a transfer between two debt or savings tiles', { accountId: 'savings', toAccountId: 'debt' }],
  ])('ignores %s', (_name, fields) => {
    expect(shifts(fields)).toEqual([]);
  });
});
