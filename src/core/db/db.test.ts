import '@/test/setup-db';
import Dexie from 'dexie';
import { describe, expect, it, vi } from 'vitest';
import { alive, db, exportBackup, importBackup, openData, softDelete } from './db';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SETTINGS = { currency: 'EGP', rates: {}, balanceView: 'sum' as const, weekStart: 6, profileName: '', profileColor: '#10b981' };

// One flow, in order: an existing install is migrated, then used. (Tests in a file share the database.)
describe('move to UUID ids (budgy → budgy2)', () => {
  it('copies the old database, rewriting links and stored ids', async () => {
    const legacy = new Dexie('budgy');
    legacy.version(3).stores({
      accounts: '++id, order, archived',
      categories: '++id, kind, order, archived',
      transactions: '++id, date, type, accountId, toAccountId, categoryId, [type+date]',
    });
    await legacy.open();
    await legacy.table('accounts').bulkAdd([
      { id: 1, name: 'Cash', type: 'cash', icon: 'cash', color: '#000', currency: 'EGP', initialBalance: 100, order: 0, createdAt: 'x' },
      { id: 2, name: 'Bank', type: 'bank', icon: 'bank', color: '#111', currency: 'EGP', initialBalance: 0, order: 1, group: 'savings', createdAt: 'x' },
    ]);
    await legacy.table('categories').bulkAdd([
      { id: 1, key: 'groceries', name: '', kind: 'expense', icon: 'cart', color: '#0f0', order: 0 },
      { id: 2, name: 'Rent', kind: 'expense', icon: 'home', color: '#0a0', order: 1 },
    ]);
    await legacy.table('transactions').bulkAdd([
      { id: 1, type: 'expense', amount: 30, currency: 'EGP', accountId: 1, categoryId: 1, date: '2026-10-01T10:00:00.000Z', createdAt: 'x' },
      { id: 2, type: 'transfer', amount: 50, currency: 'EGP', accountId: 2, toAccountId: 1, date: '2026-10-03T10:00:00.000Z', createdAt: 'x' },
    ]);
    legacy.close();
    localStorage.setItem('budgy-account-filter', JSON.stringify({ add: [2], remove: [1] }));
    localStorage.setItem('budgy-last-account', '2');

    expect(await openData()).toBe(false); // not a fresh install

    const accounts = await db.accounts.toArray();
    const categories = await db.categories.toArray();
    const txs = await db.transactions.toArray();
    expect([accounts.length, categories.length, txs.length]).toEqual([2, 2, 2]);
    for (const r of [...accounts, ...categories, ...txs]) {
      expect(r.id).toMatch(UUID);
      expect(r.updatedAt).toBeTruthy();
    }
    const cash = accounts.find((a) => a.name === 'Cash')!;
    const bank = accounts.find((a) => a.name === 'Bank')!;
    const groceries = categories.find((c) => c.key === 'groceries')!;
    expect(groceries.id).toBe('00000000-0000-4000-8000-000000000100'); // built-in → fixed id
    const expense = txs.find((t) => t.type === 'expense')!;
    const transfer = txs.find((t) => t.type === 'transfer')!;
    expect([expense.accountId, expense.categoryId]).toEqual([cash.id, groceries.id]);
    expect([transfer.accountId, transfer.toAccountId, transfer.categoryId]).toEqual([bank.id, cash.id, undefined]);
    expect([cash.initialBalance, bank.group]).toEqual([100, 'savings']);

    expect(JSON.parse(localStorage.getItem('budgy-account-filter')!)).toEqual({ add: [bank.id], remove: [cash.id] });
    expect(localStorage.getItem('budgy-last-account')).toBe(bank.id);
    expect(await Dexie.exists('budgy')).toBe(true); // kept as a safety copy
  });

  it("doesn't copy twice on the next start", async () => {
    localStorage.removeItem('budgy-migrated-to-budgy2');
    await openData();
    expect(await db.transactions.count()).toBe(2);
  });

  it('keeps the old database for 30 days after copying it, then removes it', async () => {
    const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    localStorage.setItem('budgy-migrated-to-budgy2', daysAgo(29));
    await openData();
    expect(await Dexie.exists('budgy')).toBe(true);

    localStorage.setItem('budgy-migrated-to-budgy2', daysAgo(31));
    await openData();
    await vi.waitFor(async () => expect(await Dexie.exists('budgy')).toBe(false));
    expect(await db.transactions.count()).toBe(2);
  });
});

describe('writes', () => {
  it('stamp ids, updatedAt and the upload mark; updates move updatedAt forward', async () => {
    const accountId = (await db.accounts.toCollection().first())!.id!;
    const id = await db.transactions.add({ type: 'expense', amount: 5, currency: 'EGP', accountId, date: '2026-11-01T09:00:00.000Z', createdAt: 'x' });
    const added = (await db.transactions.get(id))!;
    expect(id).toMatch(UUID);
    expect(added.dirty).toBe(1);
    // Even when the stored stamp is in the future (another device's clock), an edit is newer.
    await db.transactions.update(id, { updatedAt: '2099-01-01T00:00:00.000Z' });
    await db.transactions.update(id, { amount: 6 });
    expect((await db.transactions.get(id))!.updatedAt! > '2099-01-01T00:00:00.000Z').toBe(true);
  });

  it('soft-delete keeps the record, marked, and alive() skips it', async () => {
    const [first] = await db.transactions.toArray();
    await softDelete(db.transactions, [first.id!]);
    expect((await db.transactions.get(first.id!))!.deletedAt).toBeTruthy();
    expect(await db.transactions.filter(alive).count()).toBe((await db.transactions.count()) - 1);
  });
});

describe('backups', () => {
  it('version 5: no deleted records and no upload marks; restores with the same ids', async () => {
    const backup = await exportBackup(SETTINGS);
    expect(backup.version).toBe(5);
    expect(backup.transactions.every((t) => !t.deletedAt && t.dirty === undefined)).toBe(true);
    const someId = backup.transactions[0].id;
    await importBackup(JSON.parse(JSON.stringify(backup)));
    expect(await db.transactions.get(someId!)).toBeTruthy();
  });

  it('restores subcategories and the transactions that use them', async () => {
    const subcategories = [{ id: 'akl', name: 'Akl', icon: 'restaurant' }];
    const categoryId = await db.categories.add({ name: 'Food', kind: 'expense', icon: 'restaurant', color: '#f00', order: 9, subcategories });
    const txId = await db.transactions.add({
      type: 'expense', amount: 5, currency: 'EGP', accountId: 'cash', categoryId, subcategoryId: 'akl', date: '2026-11-01T10:00:00.000Z', createdAt: 'x',
    });
    const backup = JSON.parse(JSON.stringify(await exportBackup(SETTINGS)));
    await db.categories.clear();
    await db.transactions.clear();
    await importBackup(backup);
    expect((await db.categories.get(categoryId))?.subcategories).toEqual(subcategories);
    expect((await db.transactions.get(txId))?.subcategoryId).toBe('akl');
  });

  it('version 4 (numbered ids) restores with new UUIDs and links rewritten', async () => {
    await importBackup({
      app: 'budgy', version: 4, exportedAt: 'x',
      accounts: [{ id: 7, name: 'Wallet', type: 'wallet', icon: 'wallet', color: '#222', currency: 'USD', initialBalance: 10, order: 0, createdAt: 'x' }],
      categories: [{ id: 3, name: 'Fun', kind: 'expense', icon: 'other', color: '#333', order: 0 }],
      transactions: [{ id: 9, type: 'expense', amount: 2, currency: 'USD', accountId: 7, categoryId: 3, date: 'x', createdAt: 'x' }],
    });
    const [wallet] = await db.accounts.toArray();
    const [fun] = await db.categories.toArray();
    const [tx] = await db.transactions.toArray();
    expect([wallet.id, fun.id, tx.id].every((id) => UUID.test(id!))).toBe(true);
    expect([tx.accountId, tx.categoryId]).toEqual([wallet.id, fun.id]);
  });
});
