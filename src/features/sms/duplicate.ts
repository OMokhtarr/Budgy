import { alive, db, type BudgyDB } from '@/core/db/db';
import { addDays, dayKey, parseDayKey } from '@/core/utils/period';
import type { TxDraft } from '@/features/transactions/txRecord';
import type { Transaction } from '@/shared/models';

/** A live hand-entered transaction (no smsFingerprint) with the same type, amount, currency and account on the same local day. */
export async function findManualDuplicate(
  d: Pick<TxDraft, 'type' | 'amount' | 'currency' | 'accountId' | 'date'>,
  database: BudgyDB = db,
): Promise<Transaction | undefined> {
  const start = parseDayKey(dayKey(new Date(d.date)));
  const end = addDays(start, 1);
  return database.transactions
    .where('date')
    .between(start.toISOString(), end.toISOString(), true, false)
    .filter(
      (x) =>
        alive(x) &&
        !x.smsFingerprint &&
        x.type === d.type &&
        x.amount === d.amount &&
        x.currency === d.currency &&
        x.accountId === d.accountId,
    )
    .first();
}
