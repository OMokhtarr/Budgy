import { SEED_TIME, SYNCED_TABLES, writeFromCloud, type BudgyDB, type SyncedTable } from '@/core/db/db';
import type { Synced } from '@/shared/models';
import type { BackupSettings } from '@/core/contexts/SettingsContext';

/**
 * Two-way sync between the device's Dexie database and the cloud copy (Supabase, see
 * `supabase/migrations`). The app always reads and writes Dexie; this runs in the background.
 *
 * - Pull: rows the server changed since this device's cursor. A row replaces the local record when it
 *   is newer ("last edit wins" on `updatedAt`); a local record waiting to upload that is newer stays.
 * - Push: records marked `dirty` (changed here). The server ignores any that are older than its copy.
 * - Settings: one row per user, same rule. On a device's first sync the cloud's settings win, so a new
 *   phone doesn't overwrite the account's currency and exchange rates with its fresh defaults.
 */

/** A record as stored in the cloud: sync bookkeeping in columns, the app's fields in `data`. */
export interface RemoteRow {
  id: string;
  data: Record<string, unknown>;
  updated_at: string;
  deleted_at: string | null;
  server_updated_at?: string;
}

export interface RemoteSettings {
  data: Partial<BackupSettings>;
  updated_at: string;
}

/** The cloud, as sync needs it. `SupabaseRemote` is the real one; tests use an in-memory one. */
export interface Remote {
  push(table: SyncedTable, rows: RemoteRow[]): Promise<void>;
  /** Rows with server_updated_at after `since` (all when null), oldest first, at most `limit`. */
  pull(table: SyncedTable, since: string | null, limit: number): Promise<RemoteRow[]>;
  /** Every id the account has in `table`, deleted ones included. */
  allIds(table: SyncedTable): Promise<string[]>;
  /** Whether the account already has transactions in the cloud. */
  hasTransactions(): Promise<boolean>;
  getSettings(): Promise<RemoteSettings | null>;
  putSettings(settings: RemoteSettings): Promise<void>;
}

/** The app's settings, as sync needs them (backed by SettingsContext). */
export interface SettingsPort {
  get(): { data: Partial<BackupSettings>; updatedAt?: string; dirty: boolean };
  apply(data: Partial<BackupSettings>, updatedAt: string): void;
  markClean(updatedAt: string): void;
}

/** Per device and account, kept between syncs. */
export interface SyncState {
  /** Latest server_updated_at pulled, per table. */
  cursors: Partial<Record<SyncedTable, string>>;
  /** This device has completed a sync for this account. */
  synced?: boolean;
  /** Local data was replaced (restore / erase): make the cloud match it on the next sync. */
  replaceCloud?: boolean;
}

/** Whether there's anything to send or finish: unsent changes, or a first sync or restore / erase that didn't complete. */
export function hasWorkToSync(state: SyncState, unsent: boolean): boolean {
  return unsent || !state.synced || !!state.replaceCloud;
}

const PAGE = 500;
/** Pulls re-read the last minute too: a row committed late with an earlier server time is still seen. */
const OVERLAP_MS = 60_000;

const iso = (t: string) => new Date(t).toISOString();
const newer = (a: string | undefined, b: string | undefined) => Date.parse(a ?? SEED_TIME) > Date.parse(b ?? SEED_TIME);

export function toRow(record: Synced): RemoteRow {
  const { id, updatedAt, deletedAt, dirty: _dirty, ...data } = record;
  return { id: id!, data, updated_at: updatedAt ?? SEED_TIME, deleted_at: deletedAt ?? null };
}

export function fromRow(row: RemoteRow): Synced {
  return {
    ...row.data,
    id: row.id,
    updatedAt: iso(row.updated_at),
    deletedAt: row.deleted_at ? iso(row.deleted_at) : undefined,
  };
}

/** Whether this device has data of its own worth asking about before merging with an account. */
export async function hasLocalTransactions(database: BudgyDB): Promise<boolean> {
  return (await database.transactions.filter((t) => !t.deletedAt).count()) > 0;
}

/** Empties the local tables without marking anything for upload (e.g. "use the cloud's data"). */
export async function clearLocal(database: BudgyDB): Promise<void> {
  await writeFromCloud(database, async () => {
    await Promise.all(SYNCED_TABLES.map((t) => database.table(t).clear()));
  });
}

async function pullTable(database: BudgyDB, remote: Remote, table: SyncedTable, state: SyncState) {
  const cursor = state.cursors[table];
  let since = cursor ? new Date(Date.parse(cursor) - OVERLAP_MS).toISOString() : null;
  for (;;) {
    const rows = await remote.pull(table, since, PAGE);
    if (!rows.length) break;
    await writeFromCloud(database, async () => {
      const t = database.table<Synced, string>(table);
      const locals = await t.bulkGet(rows.map((r) => r.id));
      const apply = rows.filter((r, i) => {
        const local = locals[i];
        // Equal stamps are the same edit (often our own upload coming back): nothing to do.
        return !local || newer(r.updated_at, local.updatedAt);
      });
      await t.bulkPut(apply.map(fromRow));
    });
    const last = rows[rows.length - 1].server_updated_at;
    if (last && newer(last, state.cursors[table])) state.cursors[table] = iso(last);
    if (rows.length < PAGE) break;
    since = rows[rows.length - 1].server_updated_at ?? null;
  }
}

async function pushTable(database: BudgyDB, remote: Remote, table: SyncedTable) {
  const t = database.table<Synced, string>(table);
  const dirty = await t.where('dirty').equals(1).toArray();
  for (let i = 0; i < dirty.length; i += PAGE) {
    const batch = dirty.slice(i, i + PAGE);
    await remote.push(table, batch.map(toRow));
    // Clear the mark only where nothing changed while uploading; later edits upload next time.
    const sent = new Map(batch.map((r) => [r.id!, r.updatedAt]));
    await writeFromCloud(database, () =>
      t.where('id').anyOf([...sent.keys()]).modify((r) => {
        if (r.updatedAt === sent.get(r.id!)) delete r.dirty;
      }),
    );
  }
}

/** Soft-deletes in the cloud everything this device no longer has (after a restore or erase). */
async function deleteMissingInCloud(database: BudgyDB, remote: Remote) {
  const stamp = new Date().toISOString();
  for (const table of SYNCED_TABLES) {
    const local = new Set((await database.table<Synced, string>(table).toCollection().primaryKeys()) as string[]);
    const gone = (await remote.allIds(table)).filter((id) => !local.has(id));
    for (let i = 0; i < gone.length; i += PAGE) {
      await remote.push(
        table,
        gone.slice(i, i + PAGE).map((id) => ({ id, data: {}, updated_at: stamp, deleted_at: stamp })),
      );
    }
  }
}

async function syncSettings(remote: Remote, settings: SettingsPort, firstSync: boolean) {
  const cloud = await remote.getSettings();
  const local = settings.get();
  if (cloud && (firstSync || !local.updatedAt || newer(cloud.updated_at, local.updatedAt))) {
    settings.apply(cloud.data, iso(cloud.updated_at));
    return;
  }
  if (!cloud || local.dirty) {
    const updatedAt = local.updatedAt ?? new Date().toISOString();
    await remote.putSettings({ data: local.data, updated_at: updatedAt });
    settings.markClean(updatedAt);
  }
}

/**
 * One full sync. Returns the state to keep for next time; throws on network/server errors (the caller
 * retries later; nothing is lost because unsent records stay marked).
 */
export async function syncOnce(database: BudgyDB, remote: Remote, settings: SettingsPort, state: SyncState): Promise<SyncState> {
  const next: SyncState = { ...state, cursors: { ...state.cursors } };
  if (!state.synced) {
    // First sync with this account on this device: offer everything here, not just what changed since
    // some earlier account's sync. Stamps stay as they are, so "last edit wins" still decides.
    await writeFromCloud(database, async () => {
      for (const table of SYNCED_TABLES) await database.table<Synced, string>(table).toCollection().modify((r) => { r.dirty = 1; });
    });
  }
  if (next.replaceCloud) {
    // The restored/erased data must win even where the cloud's copy is newer: stamp it all as of now
    // (the write hooks also mark it for upload), then delete in the cloud what's no longer here.
    const stamp = new Date().toISOString();
    for (const table of SYNCED_TABLES) await database.table<Synced, string>(table).toCollection().modify({ updatedAt: stamp });
    await deleteMissingInCloud(database, remote);
    next.replaceCloud = false;
  } else {
    for (const table of SYNCED_TABLES) await pullTable(database, remote, table, next);
  }
  for (const table of SYNCED_TABLES) await pushTable(database, remote, table);
  await syncSettings(remote, settings, !state.synced);
  next.synced = true;
  return next;
}
