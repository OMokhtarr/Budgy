import '@/test/setup-db';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, writeFromCloud } from './db';
import { readTransactionsBetween } from './hooks';
import type { Account, Transaction } from '@/shared/models';

const account = (id: string, fields: Partial<Account> = {}): Account => ({
  id, name: id, type: 'bank', icon: 'bank', color: '#111', currency: 'EGP', initialBalance: 0, order: 0, createdAt: 'x', ...fields,
});
const on = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).toISOString();
const tx = (id: string, fields: Partial<Transaction>): Transaction => ({
  id, type: 'expense', amount: 1, currency: 'EGP', accountId: 'visa', date: on(2026, 11, 20), createdAt: 'x', ...fields,
});
const TODAY = new Date(2026, 10, 23, 12);

beforeEach(async () => {
  await writeFromCloud(db, async () => {
    await db.accounts.clear();
    await db.transactions.clear();
    await db.accounts.bulkAdd([account('bank'), account('visa', { type: 'card', credit: { statementDay: 25, dueDay: 20 } })]);
    await db.transactions.bulkAdd([
      tx('bought', {}),
      tx('instalment', { date: on(2026, 12, 21), instalment: { planId: 'p', n: 2, of: 12 } }),
      tx('subscription', { accountId: 'bank', date: on(2026, 12, 1) }),
      tx('refund', { type: 'income', date: on(2026, 12, 5) }),
      tx('deleted', { deletedAt: 'x' }),
    ]);
  });
});

describe('readTransactionsBetween', () => {
  it("reads the period's live transactions, leaving future card charges out", async () => {
    const rows = await readTransactionsBetween(on(2026, 11, 1), on(2027, 1, 1), TODAY);
    expect(rows.map((t) => t.id).sort()).toEqual(['bought', 'refund', 'subscription']);
  });
});
