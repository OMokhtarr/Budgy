import '@/test/setup-db';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, writeFromCloud } from './db';
import { cachedCardPage, preloadCardPage } from './hooks';
import type { Account, Transaction } from '@/shared/models';

const account = (id: string, fields: Partial<Account> = {}): Account => ({
  id, name: id, type: 'card', icon: 'card', color: '#111', currency: 'EGP', initialBalance: 0, order: 0, createdAt: 'x',
  credit: { statementDay: 25, dueDay: 20 }, ...fields,
});
const tx = (id: string, fields: Partial<Transaction>): Transaction => ({
  id, type: 'expense', amount: 1, currency: 'EGP', accountId: 'visa', date: '2026-11-01T10:00:00.000Z', createdAt: 'x', ...fields,
});

beforeEach(async () => {
  await writeFromCloud(db, async () => {
    await db.accounts.clear();
    await db.transactions.clear();
    await db.accounts.bulkAdd([account('visa'), account('old', { archived: true }), account('gone', { deletedAt: 'x' })]);
    await db.transactions.bulkAdd([
      tx('spend', {}),
      tx('pay', { type: 'transfer', accountId: 'bank', toAccountId: 'visa' }),
      tx('deleted', { deletedAt: 'x' }),
      tx('other', { accountId: 'bank' }),
    ]);
  });
});

describe('preloadCardPage', () => {
  it('reads the card and its live transactions, payments to it included, before the page opens', async () => {
    expect(cachedCardPage('visa')).toEqual({});
    await preloadCardPage('visa');
    const { account: card, txs } = cachedCardPage('visa');
    expect(card?.id).toBe('visa');
    expect(txs?.map((t) => t.id).sort()).toEqual(['pay', 'spend']);
  });

  it('has no card for one that was archived, deleted or never existed', async () => {
    for (const id of ['old', 'gone', 'none']) {
      await preloadCardPage(id);
      expect(cachedCardPage(id).account).toBeNull();
    }
  });
});
