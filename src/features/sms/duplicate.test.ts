import '@/test/setup-db';
import { beforeEach, describe, expect, it } from 'vitest';
import { BudgyDB } from '@/core/db/db';
import type { Transaction } from '@/shared/models';
import { findManualDuplicate } from './duplicate';

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
