import '@/test/setup-db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BudgyDB, SEED_TIME, alive, keepOneDefault, replaceOldStarters, seedIfEmpty } from './db';
import type { Account } from '@/shared/models';

const OLD_CASH = '00000000-0000-4000-8000-000000000001';
const OLD_CARD = '00000000-0000-4000-8000-000000000002';

const account = (fields: Partial<Account>): Account => ({
  name: '', type: 'cash', icon: 'cash', color: '#111', currency: 'SAR', initialBalance: 0, order: 0, createdAt: 'x', updatedAt: SEED_TIME, ...fields,
});
const oldCash = (fields: Partial<Account> = {}) => account({ id: OLD_CASH, ...fields });
const oldCard = (fields: Partial<Account> = {}) => account({ id: OLD_CARD, type: 'card', ...fields });

let database: BudgyDB;
let n = 0;
beforeEach(async () => {
  database = new BudgyDB(`starters-${n++}`);
  await database.open();
});
afterEach(async () => {
  await database.delete();
});

/** The accounts a person would see, by what identifies them: name, else starter key, else old id. */
const shown = async () =>
  (await database.accounts.filter(alive).toArray()).map((a) => a.name || a.key || a.id).sort();

describe('seedIfEmpty', () => {
  it('starts a new install with Cash In for income and Cash Out for expenses', async () => {
    await seedIfEmpty(database);
    const accounts = await database.accounts.toArray();
    expect(accounts.map((a) => [a.key, a.defaultFor]).sort()).toEqual([['cashIn', 'income'], ['cashOut', 'expense']]);
  });
});

describe('replaceOldStarters', () => {
  it('swaps untouched, empty Cash and Card for Cash In and Cash Out, in their currency', async () => {
    await database.accounts.bulkAdd([oldCash(), oldCard()]);
    await replaceOldStarters(database);
    expect(await shown()).toEqual(['cashIn', 'cashOut']);
    expect((await database.accounts.filter(alive).toArray()).map((a) => a.currency)).toEqual(['SAR', 'SAR']);
  });

  it('marks the old ones deleted, so the removal reaches other devices', async () => {
    await database.accounts.bulkAdd([oldCash(), oldCard()]);
    await replaceOldStarters(database);
    const old = (await database.accounts.get(OLD_CASH))!;
    expect(old.deletedAt).toBeTruthy();
    expect(old.dirty).toBe(1);
    expect(old.updatedAt! > SEED_TIME).toBe(true);
  });

  it('keeps the other accounts', async () => {
    await database.accounts.bulkAdd([oldCash(), oldCard(), account({ id: 'cib', name: 'CIB', group: 'debt' })]);
    await replaceOldStarters(database);
    expect(await shown()).toEqual(['CIB', 'cashIn', 'cashOut']);
  });

  it.each<[string, Account[]]>([
    ['Cash was renamed', [oldCash({ name: 'Wallet' }), oldCard()]],
    ['Cash was edited without a new name', [oldCash({ updatedAt: '2026-11-01T00:00:00.000Z' }), oldCard()]],
    ['Card has an opening balance', [oldCash(), oldCard({ initialBalance: 100 })]],
    ['Card holds a second-currency balance', [oldCash(), oldCard({ currency2: 'USD', initialBalance2: 5 })]],
  ])('changes nothing when %s', async (_name, rows) => {
    await database.accounts.bulkAdd(rows);
    const before = await shown();
    await replaceOldStarters(database);
    expect(await shown()).toEqual(before);
  });

  it.each<[string, Record<string, string>]>([
    ['an expense uses Cash', { accountId: OLD_CASH }],
    ['a transfer arrives in Card', { accountId: 'cib', toAccountId: OLD_CARD }],
  ])('changes nothing when %s', async (_name, link) => {
    await database.accounts.bulkAdd([oldCash(), oldCard()]);
    await database.transactions.add({ type: 'expense', amount: 5, currency: 'SAR', accountId: '', date: '2026-11-01T00:00:00.000Z', createdAt: 'x', ...link });
    await replaceOldStarters(database);
    expect((await shown()).length).toBe(2);
    expect((await database.accounts.get(OLD_CASH))!.deletedAt).toBeUndefined();
  });

  it('adds no duplicates when run again', async () => {
    await database.accounts.bulkAdd([oldCash(), oldCard()]);
    await replaceOldStarters(database);
    await replaceOldStarters(database);
    expect(await shown()).toEqual(['cashIn', 'cashOut']);
  });

  it('adds no duplicates when old and new starters arrive together from another device', async () => {
    await seedIfEmpty(database);
    await database.accounts.bulkAdd([oldCash(), oldCard()]);
    await replaceOldStarters(database);
    expect(await shown()).toEqual(['cashIn', 'cashOut']);
  });

  it('leaves an install without the old starters alone', async () => {
    await database.accounts.add(account({ id: 'cib', name: 'CIB' }));
    await replaceOldStarters(database);
    expect(await shown()).toEqual(['CIB']);
  });
});

describe('keepOneDefault', () => {
  it('takes the default from the other account, leaving the opposite default alone', async () => {
    await database.accounts.bulkAdd([
      account({ id: 'a', name: 'A', defaultFor: 'expense' }),
      account({ id: 'b', name: 'B', defaultFor: 'expense' }),
      account({ id: 'c', name: 'C', defaultFor: 'income' }),
    ]);
    await keepOneDefault('b', 'expense', database);
    const a = (await database.accounts.get('a'))!;
    expect([a.defaultFor, a.dirty]).toEqual([undefined, 1]);
    expect((await database.accounts.get('b'))!.defaultFor).toBe('expense');
    expect((await database.accounts.get('c'))!.defaultFor).toBe('income');
  });
});
