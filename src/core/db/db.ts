import Dexie, { type EntityTable, type Table, type Transaction as DexieTx } from 'dexie';
import type { Account, Category, Synced, Transaction } from '@/shared/models';
import { backupSettingsOf, savedCurrency, type BackupSettings } from '@/core/contexts/SettingsContext';
import { newId } from '@/core/utils/id';

/**
 * Budgy is local-first: everything lives in IndexedDB on the device (works the same
 * in the browser, the Android WebView and the iOS WKWebView). Use Menu → Data → Back up
 * to move data between devices.
 *
 * Records have random UUID ids, an `updatedAt` time and soft deletes (`deletedAt`), so they can
 * later sync between devices. Every read must skip deleted records: use `alive`.
 */
export class BudgyDB extends Dexie {
  accounts!: EntityTable<Account, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  transactions!: EntityTable<Transaction, 'id'>;

  /** `name` is only changed by tests (two "devices" in one process). */
  constructor(name = 'budgy2') {
    // A new database: the old one ("budgy", numbered ids) can't change its primary keys in place.
    // Its data is copied over once by `migrateLegacy`.
    super(name);
    this.version(1).stores({
      accounts: 'id, updatedAt, dirty, order, archived',
      categories: 'id, updatedAt, dirty, kind, order, archived',
      transactions: 'id, updatedAt, dirty, date, type, accountId, toAccountId, categoryId, [type+date]',
    });
    for (const name of SYNCED_TABLES) stampWrites(this.table(name));
  }
}

export const SYNCED_TABLES = ['accounts', 'categories', 'transactions'] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

/** Transactions that apply changes downloaded by sync: they keep the cloud's stamps and aren't uploaded again. */
const fromCloud = new WeakSet<DexieTx>();

/**
 * Every new record gets an id, and every local write an `updatedAt` and the `dirty` mark ("upload me"),
 * wherever in the app it happens.
 */
function stampWrites(table: Table<Synced, string>) {
  table.hook('creating', (_key, obj, tx) => {
    obj.id ??= newId();
    if (!fromCloud.has(tx)) {
      obj.updatedAt ??= now();
      obj.dirty = 1;
    }
    return obj.id;
  });
  table.hook('updating', (mods, _key, obj, tx) => {
    if (fromCloud.has(tx)) return undefined;
    return 'updatedAt' in mods ? { dirty: 1 } : { updatedAt: after(obj.updatedAt), dirty: 1 };
  });
}

/**
 * Now, but always later than `prev`: an edit must count as newer than the version it changes, even when
 * that version came from a device whose clock runs ahead (otherwise "last edit wins" would drop it).
 */
function after(prev: string | undefined): string {
  return new Date(Math.max(Date.now(), prev ? Date.parse(prev) + 1 : 0)).toISOString();
}

/** Runs `fn` in a transaction whose writes count as coming from the cloud (see `fromCloud`). */
export function writeFromCloud<T>(database: BudgyDB, fn: () => Promise<T>): Promise<T> {
  return database.transaction('rw', database.accounts, database.categories, database.transactions, (tx) => {
    fromCloud.add(tx as unknown as DexieTx);
    return fn();
  });
}

export const db = new BudgyDB();

/**
 * The starting accounts and categories get the same fixed ids on every install, and a 1970 stamp, so
 * when two devices sync their defaults merge into one and any real edit (newer) wins over an untouched
 * default.
 */
export const SEED_TIME = '1970-01-01T00:00:00.000Z';
const seedId = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const SEED_ACCOUNT_IDS: Record<string, string> = { cash: seedId(1), card: seedId(2) };
const seedCategoryId = (key: string) => {
  const i = [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES].findIndex((c) => c.key === key);
  return i < 0 ? undefined : seedId(0x100 + i);
};

/** Drops the local-only `dirty` mark, e.g. before records go into a backup file. */
const withoutDirty = <T extends Synced>({ dirty: _dirty, ...rest }: T) => rest as T;

/** Filter for reads: true for records that haven't been deleted. */
export const alive = (x: Synced) => !x.deletedAt;

/** Deletes by marking, so the deletion can sync to other devices. */
export async function softDelete<T extends Synced, K, I>(table: Table<T, K, I>, ids: string[]): Promise<void> {
  const stamp = now();
  if (ids.length) await table.where('id').anyOf(ids).modify((x: T) => { x.deletedAt = stamp; });
}

const now = () => new Date().toISOString();

export const DEFAULT_EXPENSE_CATEGORIES: Omit<Category, 'id' | 'order'>[] = [
  { key: 'groceries', name: '', kind: 'expense', icon: 'cart', color: '#22c55e' },
  { key: 'restaurant', name: '', kind: 'expense', icon: 'restaurant', color: '#f97316' },
  { key: 'transport', name: '', kind: 'expense', icon: 'bus', color: '#3b82f6' },
  { key: 'car', name: '', kind: 'expense', icon: 'car', color: '#0ea5e9' },
  { key: 'home', name: '', kind: 'expense', icon: 'home', color: '#8b5cf6' },
  { key: 'bills', name: '', kind: 'expense', icon: 'flash', color: '#eab308' },
  { key: 'health', name: '', kind: 'expense', icon: 'medkit', color: '#ef4444' },
  { key: 'shopping', name: '', kind: 'expense', icon: 'shirt', color: '#ec4899' },
  { key: 'entertainment', name: '', kind: 'expense', icon: 'film', color: '#a855f7' },
  { key: 'education', name: '', kind: 'expense', icon: 'school', color: '#6366f1' },
  { key: 'gifts', name: '', kind: 'expense', icon: 'gift', color: '#f43f5e' },
  { key: 'other', name: '', kind: 'expense', icon: 'other', color: '#64748b' },
];

export const DEFAULT_INCOME_CATEGORIES: Omit<Category, 'id' | 'order'>[] = [
  { key: 'salary', name: '', kind: 'income', icon: 'briefcase', color: '#10b981' },
  { key: 'freelance', name: '', kind: 'income', icon: 'laptop', color: '#14b8a6' },
  { key: 'investments', name: '', kind: 'income', icon: 'trending', color: '#0f766e' },
  { key: 'giftsIn', name: '', kind: 'income', icon: 'gift', color: '#84cc16' },
];

// ── Records from before UUIDs (the old database and backups up to version 4) ──

/** A record whose ids are still the old auto-increment numbers. */
type Numbered<T> = Omit<T, 'id' | 'accountId' | 'toAccountId' | 'categoryId'> & {
  id?: number | string;
  accountId?: number | string;
  toAccountId?: number | string;
  categoryId?: number | string;
};
/** Accounts as stored before the Savings group existed. */
type LegacyAccount = Numbered<Account> & { excludeFromTotal?: boolean };

/** The previous database, opened only to copy its data into `budgy2`. Its upgrades still run. */
class LegacyDB extends Dexie {
  accounts!: Table<LegacyAccount, number>;
  categories!: Table<Numbered<Category>, number>;
  transactions!: Table<Numbered<Transaction>, number>;

  constructor() {
    super('budgy');
    const schema = {
      accounts: '++id, order, archived',
      categories: '++id, kind, order, archived',
      transactions: '++id, date, type, accountId, toAccountId, categoryId, [type+date]',
    };
    this.version(1).stores(schema);
    // v2: accounts and transactions carry their currency. Older data was all in the app currency.
    this.version(2).stores(schema).upgrade(async (tx) => {
      const cur = savedCurrency();
      await tx.table('accounts').toCollection().modify((a: Account) => { a.currency ??= cur; });
      await tx.table('transactions').toCollection().modify((t: Transaction) => { t.currency ??= cur; });
    });
    // v3: the "exclude from total" switch became the Savings group.
    this.version(3).stores(schema).upgrade(async (tx) => {
      await tx.table('accounts').toCollection().modify((a: LegacyAccount) => {
        if (a.excludeFromTotal) a.group = 'savings';
        delete a.excludeFromTotal;
      });
    });
  }
}

/** Gives numbered records new UUIDs, rewriting the links between them; also returns old → new account ids. */
function withNewIds(
  accounts: Numbered<Account>[],
  categories: Numbered<Category>[],
  transactions: Numbered<Transaction>[],
) {
  const stamp = now();
  const accountIds = new Map<string, string>();
  const categoryIds = new Map<string, string>();
  // The built-in starting records take their fixed ids, so they merge with other devices' defaults.
  for (const c of categories) {
    const fixed = c.key ? seedCategoryId(c.key) : undefined;
    if (c.id != null && fixed && ![...categoryIds.values()].includes(fixed)) categoryIds.set(String(c.id), fixed);
  }
  for (const a of accounts) {
    const fixed = !a.name ? SEED_ACCOUNT_IDS[a.type] : undefined;
    if (a.id != null && fixed && ![...accountIds.values()].includes(fixed)) accountIds.set(String(a.id), fixed);
  }
  // Links to records that no longer exist get an id too, so they still group together.
  const idIn = (map: Map<string, string>, old: number | string | undefined) => {
    if (old == null) return undefined;
    let id = map.get(String(old));
    if (!id) map.set(String(old), (id = newId()));
    return id;
  };
  return {
    accountIds,
    accounts: accounts.map((a) => ({ ...a, id: idIn(accountIds, a.id), updatedAt: stamp }) as Account),
    categories: categories.map((c) => ({ ...c, id: idIn(categoryIds, c.id), updatedAt: stamp }) as Category),
    transactions: transactions.map(
      (t) =>
        ({
          ...t,
          id: newId(),
          accountId: idIn(accountIds, t.accountId),
          toAccountId: idIn(accountIds, t.toAccountId),
          categoryId: idIn(categoryIds, t.categoryId),
          updatedAt: stamp,
        }) as Transaction,
    ),
  };
}

/** Account ids the app keeps outside the database (the accounts filter, the last-used account). */
function remapStoredAccountIds(map: Map<string, string>) {
  try {
    const FILTER_KEY = 'budgy-account-filter'; // AccountFilterContext
    const LAST_KEY = 'budgy-last-account'; // TransactionEditor
    const filter = localStorage.getItem(FILTER_KEY);
    if (filter) {
      const o = JSON.parse(filter) as { add?: unknown[]; remove?: unknown[] };
      const ids = (l: unknown[] | undefined) => (l ?? []).map((x) => map.get(String(x))).filter(Boolean);
      localStorage.setItem(FILTER_KEY, JSON.stringify({ add: ids(o.add), remove: ids(o.remove) }));
    }
    const last = localStorage.getItem(LAST_KEY);
    const lastId = last ? map.get(last) : undefined;
    if (lastId) localStorage.setItem(LAST_KEY, lastId);
    else localStorage.removeItem(LAST_KEY);
  } catch {
    /* storage unavailable: the filter and last account just start from their defaults */
  }
}

const MIGRATED_KEY = 'budgy-migrated-to-budgy2';

/**
 * One-time copy from the old database. The old one is left untouched as a safety net (remove it in a
 * later release). Runs only while `budgy2` has never had any accounts, so erased data can't come back.
 */
async function migrateLegacy(): Promise<void> {
  try {
    if (localStorage.getItem(MIGRATED_KEY)) return;
  } catch {
    /* fall back to the checks below */
  }
  if (!(await Dexie.exists('budgy')) || (await db.accounts.count()) > 0) return;
  const legacy = new LegacyDB();
  try {
    const [accounts, categories, transactions] = await Promise.all([
      legacy.accounts.toArray(),
      legacy.categories.toArray(),
      legacy.transactions.toArray(),
    ]);
    const moved = withNewIds(accounts, categories, transactions);
    await db.transaction('rw', db.accounts, db.categories, db.transactions, async () => {
      await db.accounts.bulkAdd(moved.accounts);
      await db.categories.bulkAdd(moved.categories);
      await db.transactions.bulkAdd(moved.transactions);
    });
    remapStoredAccountIds(moved.accountIds);
    try {
      localStorage.setItem(MIGRATED_KEY, now());
    } catch {
      /* ignore */
    }
  } finally {
    legacy.close();
  }
}

/** Adds starting records under their fixed ids; an id already used (e.g. by a deleted record) gets a fresh one. */
async function addSeeds<T extends Synced, K, I>(table: Table<T, K, I>, rows: T[]): Promise<void> {
  const taken = await table.bulkGet(rows.map((r) => r.id as K));
  const fresh = rows.map((r, i) => (taken[i] ? { ...r, id: newId() } : { ...r, updatedAt: SEED_TIME }));
  await table.bulkAdd(fresh as unknown as I[]);
}

/** Seeds default accounts and categories when there are none. */
export async function seedIfEmpty(database: BudgyDB = db): Promise<void> {
  await database.transaction('rw', database.accounts, database.categories, async () => {
    if ((await database.accounts.filter(alive).count()) === 0) {
      const currency = savedCurrency();
      await addSeeds(database.accounts, [
        { id: SEED_ACCOUNT_IDS.cash, name: '', type: 'cash', icon: 'cash', color: '#10b981', currency, initialBalance: 0, order: 0, createdAt: now() },
        { id: SEED_ACCOUNT_IDS.card, name: '', type: 'card', icon: 'card', color: '#3b82f6', currency, initialBalance: 0, order: 1, createdAt: now() },
      ]);
    }
    if ((await database.categories.filter(alive).count()) === 0) {
      await addSeeds(database.categories, [
        ...DEFAULT_EXPENSE_CATEGORIES.map((c, i) => ({ ...c, id: seedCategoryId(c.key!), order: i })),
        ...DEFAULT_INCOME_CATEGORIES.map((c, i) => ({ ...c, id: seedCategoryId(c.key!), order: i })),
      ]);
    }
  });
}

/**
 * Moves unused accounts to another currency (see `unusedAccountsIn`). Untouched starting accounts keep
 * their 1970 stamp, so this doesn't override what another device already has for them.
 */
export async function moveAccountsToCurrency(ids: string[], currency: string): Promise<void> {
  const rows = await db.accounts.bulkGet(ids);
  const untouched = rows.filter((a) => a?.updatedAt === SEED_TIME).map((a) => a!.id!);
  const rest = ids.filter((id) => !untouched.includes(id));
  if (untouched.length) await db.accounts.where('id').anyOf(untouched).modify({ currency, updatedAt: SEED_TIME });
  if (rest.length) await db.accounts.where('id').anyOf(rest).modify({ currency });
}

/** Opens the data at startup: copies the old database if needed, then seeds. True on a fresh install. */
export async function openData(): Promise<boolean> {
  await migrateLegacy();
  const fresh = (await db.accounts.count()) === 0;
  await seedIfEmpty();
  return fresh;
}

/**
 * Ids of single-currency accounts in `cur` that have never held money: no opening balance and no
 * transactions. Typically the starting Cash/Card accounts, seeded before the user picked a currency.
 */
export async function unusedAccountsIn(cur: string): Promise<string[]> {
  const candidates = (await db.accounts.filter(alive).toArray()).filter(
    (a) => a.currency === cur && !a.currency2 && !a.initialBalance,
  );
  const ids: string[] = [];
  for (const a of candidates) {
    const used = await db.transactions.where('accountId').equals(a.id!).or('toAccountId').equals(a.id!).filter(alive).count();
    if (!used) ids.push(a.id!);
  }
  return ids;
}

export interface BackupFile {
  app: 'budgy';
  /**
   * 1 = before currencies were stored per account/transaction; 2 = before account groups;
   * 3 = before settings (main currency, exchange rates…) were included; 4 = before UUID ids.
   */
  version: 1 | 2 | 3 | 4 | 5;
  exportedAt: string;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  settings?: Partial<BackupSettings>;
}

export async function exportBackup(settings: BackupSettings): Promise<BackupFile> {
  const [accounts, categories, transactions] = await Promise.all([
    db.accounts.filter(alive).toArray(),
    db.categories.filter(alive).toArray(),
    db.transactions.filter(alive).toArray(),
  ]);
  return {
    app: 'budgy',
    version: 5,
    exportedAt: now(),
    accounts: accounts.map(withoutDirty),
    categories: categories.map(withoutDirty),
    transactions: transactions.map(withoutDirty),
    settings: backupSettingsOf(settings),
  };
}

/** Replaces all data with the backup's; returns the backed-up settings for the caller to apply. */
export async function importBackup(data: unknown): Promise<Partial<BackupSettings>> {
  const b = data as Partial<BackupFile>;
  if (!b || b.app !== 'budgy' || !Array.isArray(b.accounts) || !Array.isArray(b.categories) || !Array.isArray(b.transactions)) {
    throw new Error('invalid-backup');
  }
  const settings = backupSettingsOf(b.settings);
  // Version 1 backups have no currencies (everything was in the app currency);
  // versions 1–2 mark savings with "excludeFromTotal" instead of a group.
  const cur = settings.currency ?? savedCurrency();
  let accounts = (b.accounts as unknown as LegacyAccount[]).map(({ excludeFromTotal, ...a }) => ({
    ...a,
    currency: a.currency ?? cur,
    group: a.group ?? (excludeFromTotal ? ('savings' as const) : undefined),
  })) as Account[];
  let categories = b.categories;
  let transactions = b.transactions.map((t) => ({ ...t, currency: t.currency ?? cur }));
  // Before version 5 ids were numbers.
  if ((b.version ?? 1) < 5) {
    const moved = withNewIds(accounts as Numbered<Account>[], categories as Numbered<Category>[], transactions as Numbered<Transaction>[]);
    ({ accounts, categories, transactions } = moved);
  }
  // Restored records are marked "upload me" by the write hooks, like any local change.
  await db.transaction('rw', db.accounts, db.categories, db.transactions, async () => {
    await Promise.all([db.accounts.clear(), db.categories.clear(), db.transactions.clear()]);
    await db.accounts.bulkAdd(accounts.map(withoutDirty));
    await db.categories.bulkAdd(categories.map(withoutDirty));
    await db.transactions.bulkAdd(transactions.map(withoutDirty));
  });
  return settings;
}

/** Wipes everything and seeds the defaults again. (With sync this will need to delete in the cloud too.) */
export async function eraseAll(): Promise<void> {
  await db.transaction('rw', db.accounts, db.categories, db.transactions, async () => {
    await Promise.all([db.accounts.clear(), db.categories.clear(), db.transactions.clear()]);
  });
  await seedIfEmpty();
}
