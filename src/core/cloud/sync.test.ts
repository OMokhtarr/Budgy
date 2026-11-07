import '@/test/setup-db';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BudgyDB, SEED_TIME, alive, eraseAll, exportBackup, importBackup, db, seedIfEmpty, softDelete, type SyncedTable } from '@/core/db/db';
import { stampIfSynced, type Settings } from '@/core/contexts/SettingsContext';
import { idFromKey } from '@/core/utils/id';
import { clearLocal, hasWorkToSync, syncOnce, type Remote, type RemoteRow, type RemoteSettings, type SettingsPort, type SyncState } from './sync';

/** An in-memory server with the same rules as the Supabase migration: last edit wins, equal stamps ignored. */
function fakeServer() {
  let clock = Date.parse('2026-11-03T12:00:00Z');
  const tables: Record<SyncedTable, Map<string, RemoteRow>> = {
    accounts: new Map(),
    categories: new Map(),
    transactions: new Map(),
    smsLinks: new Map(),
    merchantRules: new Map(),
  };
  const server = { tables, settings: null as RemoteSettings | null, writes: 0 };
  const remote: Remote = {
    async push(table, rows) {
      for (const r of rows) {
        const old = tables[table].get(r.id);
        if (old && Date.parse(r.updated_at) <= Date.parse(old.updated_at)) continue;
        tables[table].set(r.id, { ...structuredClone(r), server_updated_at: new Date(clock++).toISOString() });
        server.writes++;
      }
    },
    async pull(table, since, limit) {
      return [...tables[table].values()]
        .filter((r) => !since || r.server_updated_at! > since)
        .sort((a, b) => a.server_updated_at!.localeCompare(b.server_updated_at!))
        .slice(0, limit)
        .map((r) => structuredClone(r));
    },
    allStamps: async (table) => [...tables[table].values()].map(({ id, updated_at }) => ({ id, updated_at })),
    hasTransactions: async () => [...tables.transactions.values()].some((r) => !r.deleted_at),
    getSettings: async () => server.settings && structuredClone(server.settings),
    async putSettings(s) {
      if (!server.settings || Date.parse(s.updated_at) > Date.parse(server.settings.updated_at)) server.settings = structuredClone(s);
    },
  };
  return { server, remote };
}

/** A phone: its database, its settings and its sync state. */
function phone(database: BudgyDB, remote: Remote, settings: { data: Record<string, unknown>; updatedAt?: string; dirty: boolean }) {
  let state: SyncState = { cursors: {} };
  const port: SettingsPort = {
    get: () => settings,
    apply: (data, updatedAt) => Object.assign(settings, { data: { ...settings.data, ...data }, updatedAt, dirty: false }),
    markClean: (updatedAt) => {
      if (settings.updatedAt === updatedAt) settings.dirty = false;
    },
  };
  return {
    settings,
    sync: async () => {
      state = await syncOnce(database, remote, port, state);
    },
    replaceCloud: () => {
      state = { ...state, replaceCloud: true };
    },
  };
}

const dirtyCount = async (d: BudgyDB) =>
  (await d.accounts.where('dirty').equals(1).count()) +
  (await d.categories.where('dirty').equals(1).count()) +
  (await d.transactions.where('dirty').equals(1).count());

const CASH = '00000000-0000-4000-8000-000000000003';
const GROCERIES = '00000000-0000-4000-8000-000000000100';

// One story, in order: phone A starts the account, phone B joins, both keep using it.
describe('sync between two phones', () => {
  const { server, remote } = fakeServer();
  const A = phone(db, remote, { data: { currency: 'USD', rates: { EGP: 0.02 } }, updatedAt: '2026-11-01T00:00:00.000Z', dirty: true });
  const bDb = new BudgyDB('phone-b');
  const B = phone(bDb, remote, { data: { currency: 'EGP', rates: {} }, updatedAt: '2026-11-03T09:00:00.000Z', dirty: true });
  let txId = '';

  // The edits below carry fixed stamps, so "now" must stay earlier than them. Only Date is faked: IndexedDB needs real timers.
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.parse('2026-11-03T12:00:00Z') });
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('A uploads everything, then has nothing left to upload', async () => {
    await seedIfEmpty(db);
    expect((await db.accounts.get(CASH))?.updatedAt).toBe(SEED_TIME);
    await db.accounts.update(CASH, { name: 'Wallet' });
    txId = (await db.transactions.add({ type: 'expense', amount: 30, currency: 'USD', accountId: CASH, categoryId: GROCERIES, date: '2026-11-02T10:00:00.000Z', createdAt: 'x' }))!;
    await A.sync();
    expect([server.tables.accounts.size, server.tables.categories.size, server.tables.transactions.size]).toEqual([2, 16, 1]);
    expect(await dirtyCount(db)).toBe(0);
    expect(server.settings?.data.currency).toBe('USD');
  });

  it("B's defaults merge with A's (no duplicates) and A's edits win over B's untouched defaults", async () => {
    await seedIfEmpty(bDb);
    await B.sync();
    expect([await bDb.accounts.count(), await bDb.categories.count(), server.tables.accounts.size]).toEqual([2, 16, 2]);
    expect((await bDb.accounts.get(CASH))?.name).toBe('Wallet');
    expect((server.tables.accounts.get(CASH)!.data as { name: string }).name).toBe('Wallet');
    expect((await bDb.transactions.get(txId))?.categoryId).toBe(GROCERIES);
  });

  it("on a new phone's first sync the account's settings win", () => {
    expect(B.settings.data.currency).toBe('USD');
    expect(server.settings?.data.currency).toBe('USD');
  });

  it('another round changes nothing (no echo)', async () => {
    const before = server.writes;
    await A.sync();
    await B.sync();
    expect(server.writes).toBe(before);
    expect([await dirtyCount(db), await dirtyCount(bDb)]).toEqual([0, 0]);
  });

  it('the later of two edits to the same record wins on both phones', async () => {
    await db.transactions.update(txId, { amount: 40, updatedAt: '2026-11-03T13:00:00.000Z' });
    await bDb.transactions.update(txId, { amount: 50, updatedAt: '2026-11-03T14:00:00.000Z' });
    await A.sync();
    await B.sync();
    await A.sync();
    expect([(await db.transactions.get(txId))?.amount, (await bDb.transactions.get(txId))?.amount]).toEqual([50, 50]);
  });

  it('an older edit made offline loses when it arrives late', async () => {
    await bDb.transactions.update(txId, { note: 'old offline note', updatedAt: '2026-11-03T13:30:00.000Z' });
    await B.sync();
    expect((await bDb.transactions.get(txId))?.note).toBeUndefined();
  });

  it('deletes and new records travel both ways', async () => {
    await softDelete(db.transactions, [txId]);
    const fromB = await bDb.transactions.add({ type: 'income', amount: 7, currency: 'USD', accountId: CASH, categoryId: GROCERIES, date: 'x', createdAt: 'x' });
    await A.sync();
    await B.sync();
    await A.sync();
    expect((await bDb.transactions.get(txId))?.deletedAt).toBeTruthy();
    expect(await bDb.transactions.filter(alive).count()).toBe(1);
    expect((await db.transactions.get(fromB))?.amount).toBe(7);
  });

  it('subcategories and the transactions that use them reach the other phone', async () => {
    const subcategories = [{ id: 'akl', name: 'Akl', icon: 'restaurant' }];
    await db.categories.update(GROCERIES, { subcategories });
    const id = await db.transactions.add({ type: 'expense', amount: 9, currency: 'USD', accountId: CASH, categoryId: GROCERIES, subcategoryId: 'akl', date: 'x', createdAt: 'x' });
    await A.sync();
    await B.sync();
    expect((await bDb.categories.get(GROCERIES))?.subcategories).toEqual(subcategories);
    expect((await bDb.transactions.get(id))?.subcategoryId).toBe('akl');
  });

  it('restoring a backup on A makes the account (and B) match it', async () => {
    vi.setSystemTime('2026-11-03T15:00:00Z');
    const backup = await exportBackup({ currency: 'USD', rates: {}, balanceView: 'sum', weekStart: 6, profileName: '', profileColor: '#10b981' });
    const extra = await db.transactions.add({ type: 'expense', amount: 99, currency: 'USD', accountId: CASH, categoryId: GROCERIES, date: 'x', createdAt: 'x' });
    await db.accounts.update(CASH, { name: 'Renamed later' });
    await A.sync();
    await B.sync();
    vi.setSystemTime('2026-11-03T16:00:00Z');
    await importBackup(backup);
    A.replaceCloud();
    await A.sync();
    await B.sync();
    expect((await bDb.transactions.get(extra))?.deletedAt).toBeTruthy();
    expect([(await db.accounts.get(CASH))?.name, (await bDb.accounts.get(CASH))?.name]).toEqual(['Wallet', 'Wallet']);
  });

  it("a first sync with a different, empty account uploads everything, not just recent changes", async () => {
    const other = fakeServer();
    const A2 = phone(db, other.remote, A.settings);
    await A2.sync();
    expect(other.server.tables.accounts.size).toBe(await db.accounts.count());
    expect(other.server.tables.transactions.size).toBe(await db.transactions.count());
  });
});

describe('a phone whose clock is behind the cloud', () => {
  const SETTINGS = { currency: 'USD', rates: {}, balanceView: 'sum' as const, weekStart: 6, profileName: '', profileColor: '#10b981' };

  /** A phone that synced at noon, with an extra transaction and a renamed account, and whose clock then fell back to 8am. */
  async function syncedThenSlow() {
    const { server, remote } = fakeServer();
    const A = phone(db, remote, { data: { currency: 'USD' }, updatedAt: '2026-11-04T09:00:00.000Z', dirty: true });
    vi.setSystemTime('2026-11-04T12:00:00Z');
    await db.accounts.update(CASH, { name: 'Before' });
    const backup = await exportBackup(SETTINGS);
    const extra = (await db.transactions.add({ type: 'expense', amount: 99, currency: 'USD', accountId: CASH, categoryId: GROCERIES, date: 'x', createdAt: 'x' }))!;
    await db.accounts.update(CASH, { name: 'Renamed later' });
    await A.sync();
    vi.setSystemTime('2026-11-04T08:00:00Z');
    return { server, A, backup, extra };
  }

  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('a restore still replaces the cloud, and stays after the next sync', async () => {
    const { server, A, backup, extra } = await syncedThenSlow();
    await importBackup(backup);
    A.replaceCloud();
    await A.sync();
    expect(server.tables.transactions.get(extra)?.deleted_at).toBeTruthy();
    expect((server.tables.accounts.get(CASH)!.data as { name: string }).name).toBe('Before');
    await A.sync();
    expect((await db.accounts.get(CASH))?.name).toBe('Before');
    expect(await dirtyCount(db)).toBe(0);
  });

  it('an erase still empties the cloud', async () => {
    const { server, A, extra } = await syncedThenSlow();
    await eraseAll();
    A.replaceCloud();
    await A.sync();
    expect(server.tables.transactions.get(extra)?.deleted_at).toBeTruthy();
    expect((server.tables.accounts.get(CASH)!.data as { name: string }).name).toBe('');
  });

  it('restored settings replace the cloud and are not overwritten by its copy', async () => {
    const { server, A, backup } = await syncedThenSlow();
    expect(server.settings?.data.currency).toBe('USD');
    await importBackup(backup);
    Object.assign(A.settings, { data: { currency: 'EUR' }, updatedAt: new Date().toISOString(), dirty: true });
    A.replaceCloud();
    await A.sync();
    expect(server.settings?.data.currency).toBe('EUR');
    expect(A.settings.data.currency).toBe('EUR');
    expect(A.settings.dirty).toBe(false);
  });

  it('a settings edit still reaches the cloud, and stays after the next sync', async () => {
    const { server, A } = await syncedThenSlow();
    const edited = stampIfSynced(
      { currency: 'USD', syncedUpdatedAt: A.settings.updatedAt } as Settings,
      { currency: 'EUR', syncedUpdatedAt: A.settings.updatedAt } as Settings,
    );
    Object.assign(A.settings, { data: { currency: 'EUR' }, updatedAt: edited.syncedUpdatedAt, dirty: edited.syncedDirty });
    await A.sync();
    expect(server.settings?.data.currency).toBe('EUR');
    await A.sync();
    expect(A.settings.data.currency).toBe('EUR');
  });
});

describe('learned SMS links', () => {
  it('learned links sync between phones under the same id', async () => {
    const { remote } = fakeServer();
    const aDb = new BudgyDB('links-a');
    const bDb = new BudgyDB('links-b');
    const A = phone(aDb, remote, { data: {}, dirty: false });
    const B = phone(bDb, remote, { data: {}, dirty: false });
    const later = (ms: number) => new Date(Date.now() + ms).toISOString();

    const cib = await idFromKey('CIB|4821');
    await aDb.smsLinks.put({ id: cib, address: 'CIB', digits: '4821', accountId: 'acc-1' });
    await A.sync();
    await B.sync();
    expect((await bDb.smsLinks.get(cib))?.accountId).toBe('acc-1');

    // Both phones learn the same new link on their own, each for a different account.
    const nbe = await idFromKey('NBE|1234');
    await aDb.smsLinks.put({ id: nbe, address: 'NBE', digits: '1234', accountId: 'acc-a', updatedAt: later(1000) });
    await bDb.smsLinks.put({ id: nbe, address: 'NBE', digits: '1234', accountId: 'acc-b', updatedAt: later(2000) });
    await A.sync();
    await B.sync();
    await A.sync();
    expect([(await aDb.smsLinks.get(nbe))?.accountId, (await bDb.smsLinks.get(nbe))?.accountId]).toEqual(['acc-b', 'acc-b']);
  });

  it('clearLocal removes pending and seen texts', async () => {
    const d = new BudgyDB('clear-local');
    await d.smsPending.put({ fingerprint: 'fp-1', smsId: '1', address: 'CIB', date: '2026-11-07T10:00:00.000Z', body: 'x', status: 'unreadable' });
    await d.smsSeen.put({ fingerprint: 'fp-2', outcome: 'dismissed', at: '2026-11-07T10:00:00.000Z' });
    await clearLocal(d);
    expect([await d.smsPending.count(), await d.smsSeen.count()]).toEqual([0, 0]);
  });
});

describe('hasWorkToSync', () => {
  const finished: SyncState = { cursors: {}, synced: true };

  it('has nothing to do when the last sync finished and nothing is unsent', () => {
    expect(hasWorkToSync(finished, false)).toBe(false);
  });

  it('has work when there are unsent changes', () => {
    expect(hasWorkToSync(finished, true)).toBe(true);
  });

  it("retries a first sync that didn't finish, so a new phone still gets its data", () => {
    expect(hasWorkToSync({ cursors: {} }, false)).toBe(true);
  });

  it("retries a restore or erase that hasn't reached the cloud, even when it left nothing unsent", () => {
    expect(hasWorkToSync({ ...finished, replaceCloud: true }, false)).toBe(true);
  });
});
