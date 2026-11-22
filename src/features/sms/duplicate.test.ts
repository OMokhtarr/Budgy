import '@/test/setup-db';
import { beforeEach, describe, expect, it } from 'vitest';
import { BudgyDB } from '@/core/db/db';
import type { Account, Transaction } from '@/shared/models';
import { findDuplicate, findInstalmentMatch, findManualDuplicate } from './duplicate';

const database = new BudgyDB('t-duplicate');

const at = (h: number, min: number, day = 3) => new Date(2026, 10, day, h, min).toISOString();
const text = (over: Partial<Parameters<typeof findManualDuplicate>[0]> = {}) => ({
  type: 'expense' as const,
  amount: 450,
  currency: 'EGP',
  accountId: 'acc',
  date: at(10, 15),
  ...over,
});
const add = (id: string, over: Partial<Transaction> = {}) =>
  database.transactions.add({ ...text(), id, categoryId: 'cat', createdAt: 'x', ...over } as Transaction);

describe('findManualDuplicate', () => {
  beforeEach(() => database.transactions.clear());

  it('finds a hand-entered match', async () => {
    await add('t1', { date: at(18, 0) });
    expect((await findManualDuplicate(text(), database))?.id).toBe('t1');
  });

  it('ignores imported, deleted and different-account transactions', async () => {
    await add('imported', { smsFingerprint: 'fp' });
    await add('deleted', { deletedAt: 'x' });
    await add('other', { accountId: 'acc2' });
    expect(await findManualDuplicate(text(), database)).toBeUndefined();
  });

  it('matches on the local day only', async () => {
    await add('late', { date: at(23, 50, 2) });
    expect(await findManualDuplicate(text({ date: at(0, 10, 3) }), database)).toBeUndefined();
    await add('early', { date: at(0, 5, 3) });
    expect((await findManualDuplicate(text({ date: at(0, 10, 3) }), database))?.id).toBe('early');
  });
});

// A card whose statement is on the 25th: its cycle runs 26 Oct to 25 Nov, the statement day included.
describe('findInstalmentMatch', () => {
  const nov = (d: number) => new Date(2026, 10, d, 12).toISOString();
  const charge = { type: 'expense' as const, amount: 1000, currency: 'EGP', accountId: 'card', date: nov(25) };
  const instalment = (id: string, date: string, over: Partial<Transaction> = {}) =>
    database.transactions.add({
      ...charge, id, date, categoryId: 'phone', note: 'Phone', instalment: { planId: 'p', n: 4, of: 12 }, createdAt: 'x', ...over,
    } as Transaction);

  beforeEach(async () => {
    await database.transactions.clear();
    await database.accounts.clear();
    await database.accounts.add({
      id: 'card', name: 'Card', type: 'card', icon: 'card', color: '#000', currency: 'EGP', initialBalance: 0, order: 0,
      credit: { statementDay: 25, dueDay: 20 }, createdAt: 'x',
    } as Account);
  });

  it('matches an instalment in the same statement cycle', async () => {
    await instalment('i4', nov(3));
    expect(await findDuplicate(charge, database)).toMatchObject({ kind: 'instalment', tx: { id: 'i4' } });
  });

  it('not one in another cycle', async () => {
    await instalment('next', nov(27));
    expect(await findInstalmentMatch(charge, database)).toBeUndefined();
  });

  it('not instalment 1 of a bank-text plan, nor one already linked, nor a deleted one', async () => {
    await instalment('linked', nov(3), { smsFingerprint: 'fp' });
    await instalment('deleted', nov(4), { deletedAt: 'x' });
    expect(await findInstalmentMatch(charge, database)).toBeUndefined();
  });

  it('not a different amount, currency or account', async () => {
    await instalment('amount', nov(3), { amount: 999 });
    await instalment('currency', nov(3), { currency: 'USD' });
    await instalment('account', nov(3), { accountId: 'other' });
    expect(await findInstalmentMatch(charge, database)).toBeUndefined();
  });

  it('the one dated nearest the text wins', async () => {
    await instalment('early', nov(1));
    await instalment('near', nov(20));
    expect((await findInstalmentMatch(charge, database))?.id).toBe('near');
  });

  it('an instalment dated the same day as the text is still an instalment match', async () => {
    await instalment('same-day', nov(25));
    expect(await findDuplicate(charge, database)).toMatchObject({ kind: 'instalment', tx: { id: 'same-day' } });
  });

  it('a hand-entered same-day match comes first', async () => {
    await instalment('i4', nov(3));
    await database.transactions.add({ ...charge, id: 'manual', categoryId: 'c', createdAt: 'x' } as Transaction);
    expect(await findDuplicate(charge, database)).toMatchObject({ kind: 'manual', tx: { id: 'manual' } });
  });

  it('income is never matched to an instalment', async () => {
    await instalment('i4', nov(3));
    expect(await findInstalmentMatch({ ...charge, type: 'income' }, database)).toBeUndefined();
  });
});
