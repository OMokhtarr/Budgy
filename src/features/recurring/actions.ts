import { alive, db, softDelete, type BudgyDB } from '@/core/db/db';
import { dayKey } from '@/core/utils/period';
import { dueDays, nextAfter, occurrenceDate, occurrenceTxId, type Repeat } from '@/core/utils/recurring';
import { stampAfter } from '@/core/utils/stamp';
import { buildTxRecord } from '@/features/transactions/txRecord';
import type { Recurring, RecurringTx, Transaction } from '@/shared/models';

/** Today's saved rate for a currency, as a new transaction in it would get (empty for the main currency). */
export type RateFor = (currency: string) => Pick<Transaction, 'rate' | 'rateCurrency'>;

const TX_KEYS = [
  'type', 'amount', 'currency', 'accountId', 'toAccountId', 'toAmount', 'toCurrency', 'categoryId', 'subcategoryId', 'note', 'moneyBack',
] as const satisfies readonly (keyof RecurringTx)[];

/** What each occurrence adds, taken from a transaction (no id, date, bank text, group or stamps). */
export function templateOf(tx: RecurringTx): RecurringTx {
  const out: Partial<Record<keyof RecurringTx, unknown>> = {};
  for (const k of TX_KEYS) if (tx[k] != null) out[k] = tx[k];
  return out as RecurringTx;
}

/** Makes a saved transaction repeat: it's the first occurrence, so the next one is the one after its day. */
export async function makeRecurring(tx: Transaction, repeat: Repeat, auto: boolean, database: BudgyDB = db): Promise<string> {
  const start = dayKey(new Date(tx.date));
  return database.transaction('rw', database.recurring, database.transactions, async () => {
    const id = (await database.recurring.add({
      tx: templateOf(tx),
      ...repeat,
      start,
      next: nextAfter({ ...repeat, start }, start),
      ...(auto ? { auto: true as const } : {}),
      createdAt: new Date().toISOString(),
    })) as string;
    await database.transactions.update(tx.id!, { recurringId: id });
    return id;
  });
}

export interface RecurringDraft extends Repeat {
  tx: RecurringTx;
  /** The next occurrence's day (YYYY-MM-DD). */
  day: string;
  auto: boolean;
}

/**
 * Saves a recurring transaction from the editor. A new one starts on `day`; an edited one starts again from
 * `day` only when the day or how often changed, so the occurrences already counted stay put otherwise.
 */
export async function saveRecurring(existing: Recurring | undefined, d: RecurringDraft, database: BudgyDB = db): Promise<string> {
  const now = new Date().toISOString();
  const moved = !existing || existing.next !== d.day || existing.unit !== d.unit || existing.every !== d.every;
  const record: Recurring = {
    id: existing?.id,
    tx: templateOf(d.tx),
    unit: d.unit,
    every: d.every,
    start: moved ? d.day : existing.start,
    next: moved ? d.day : existing.next,
    ...(d.auto ? { auto: true as const } : {}),
    createdAt: existing?.createdAt ?? now,
    // put() replaces the whole record, so stamp it here, later than the stored stamp so an edit on a phone
    // whose clock is behind isn't reverted by sync.
    updatedAt: existing ? stampAfter(existing.updatedAt) : now,
  };
  if (!existing) delete record.id;
  if (existing) {
    await database.recurring.put(record);
    return existing.id!;
  }
  return (await database.recurring.add(record)) as string;
}

/** Stops it repeating. The transactions already added stay. */
export function stopRecurring(id: string, database: BudgyDB = db): Promise<void> {
  return softDelete(database.recurring, [id]);
}

/** Moves `next` past `day` (when `day` isn't already behind it). */
async function moveNext(database: BudgyDB, id: string, day: string): Promise<void> {
  const r = await database.recurring.get(id);
  if (r && day >= r.next) await database.recurring.update(id, { next: nextAfter(r, day) });
}

/** Values for one occurrence: the recurring one's, or what the editor changed, and optionally its own date and rate. */
export type OccurrenceValues = RecurringTx & Partial<Pick<Transaction, 'date' | 'rate' | 'rateCurrency'>>;

async function putOccurrence(
  r: Recurring,
  day: string,
  values: OccurrenceValues,
  rateFor: RateFor,
  database: BudgyDB,
): Promise<[Transaction, boolean]> {
  const id = await occurrenceTxId(r.id!, day);
  return database.transaction('rw', database.recurring, database.transactions, async () => {
    // Already added here or on another phone (or added and deleted): keep that one.
    const existing = await database.transactions.get(id);
    let tx = existing;
    if (!tx) {
      const rate = values.rate != null ? { rate: values.rate, rateCurrency: values.rateCurrency } : rateFor(values.currency);
      tx = { ...buildTxRecord({ ...values, date: values.date ?? occurrenceDate(day), rate, recurringId: r.id }), id };
      await database.transactions.add(tx);
    }
    await moveNext(database, r.id!, day);
    return [tx, !existing];
  });
}

/** Adds the occurrence on `day` (once, even from two phones) and moves `next` past it. */
export async function addOccurrence(
  r: Recurring,
  day: string,
  values: OccurrenceValues,
  rateFor: RateFor,
  database: BudgyDB = db,
): Promise<Transaction> {
  return (await putOccurrence(r, day, values, rateFor, database))[0];
}

/** Skips the occurrence on `day`: nothing is added. */
export function skipOccurrence(r: Recurring, day: string, database: BudgyDB = db): Promise<void> {
  return database.transaction('rw', database.recurring, () => moveNext(database, r.id!, day));
}

/** Adds every due occurrence of the recurring transactions set to add automatically; returns how many were added. */
export async function addDueAuto(today: Date, rateFor: RateFor, database: BudgyDB = db): Promise<number> {
  const rules = (await database.recurring.filter(alive).toArray()).filter((r) => r.auto);
  let added = 0;
  for (const r of rules) {
    for (const day of dueDays(r, today)) {
      const [, fresh] = await putOccurrence(r, day, r.tx, rateFor, database);
      if (fresh) added++;
    }
  }
  return added;
}
