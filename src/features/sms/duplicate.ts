import { alive, db, type BudgyDB } from '@/core/db/db';
import { isCreditCard, statementFor } from '@/core/utils/creditCard';
import { addDays, dayKey, parseDayKey } from '@/core/utils/period';
import type { TxDraft } from '@/features/transactions/txRecord';
import type { Transaction } from '@/shared/models';

/** What a bank text is checked against: the transaction it would save. */
export type DupeQuery = Pick<TxDraft, 'type' | 'amount' | 'currency' | 'accountId' | 'date'>;

/** A transaction a text looks like it's already in: one entered by hand, or an instalment of a plan. */
export type Duplicate = { kind: 'manual' | 'instalment'; tx: Transaction };

/**
 * A live hand-entered transaction (no smsFingerprint) with the same type, amount, currency and account on the same local
 * day. Instalments of a plan are left to `findInstalmentMatch`, which links the text to them.
 */
export async function findManualDuplicate(d: DupeQuery, database: BudgyDB = db): Promise<Transaction | undefined> {
  const start = parseDayKey(dayKey(new Date(d.date)));
  const end = addDays(start, 1);
  return database.transactions
    .where('date')
    .between(start.toISOString(), end.toISOString(), true, false)
    .filter(
      (x) =>
        alive(x) &&
        !x.smsFingerprint &&
        !x.instalment &&
        x.type === d.type &&
        x.amount === d.amount &&
        x.currency === d.currency &&
        x.accountId === d.accountId,
    )
    .first();
}

/**
 * A planned instalment a text on a credit card may be the bank's monthly charge for: a live expense of a plan, on the
 * same card, with the same amount and currency, on the same statement as the text (the bank posts it on statement day,
 * which can be weeks from the day the plan dates it). One a text was already matched to, or that came from a text
 * (a plan's first entry), has a fingerprint and is left out, as are the ids in `taken` (claimed by other texts being
 * confirmed together). Of several, the one dated nearest the text.
 */
export async function findInstalmentMatch(
  d: DupeQuery,
  database: BudgyDB = db,
  taken: ReadonlySet<string> = new Set(),
): Promise<Transaction | undefined> {
  if (d.type !== 'expense') return undefined;
  const card = await database.accounts.get(d.accountId);
  if (!card || !alive(card) || !isCreditCard(card)) return undefined;
  const statementOf = (iso: string) => statementFor(card.credit!, new Date(iso)).statementOn.getTime();
  const statement = statementOf(d.date);
  const at = new Date(d.date).getTime();
  const found = await database.transactions
    .where('accountId')
    .equals(d.accountId)
    .filter(
      (x) =>
        alive(x) &&
        x.type === 'expense' &&
        !!x.instalment &&
        !x.smsFingerprint &&
        !taken.has(x.id!) &&
        x.amount === d.amount &&
        x.currency === d.currency &&
        statementOf(x.date) === statement,
    )
    .toArray();
  const away = (x: Transaction) => Math.abs(new Date(x.date).getTime() - at);
  return found.sort((a, b) => away(a) - away(b))[0];
}

/** What a text looks already saved as: a same-day hand-entered match first, then an instalment it matches. */
export async function findDuplicate(d: DupeQuery, database: BudgyDB = db, taken?: ReadonlySet<string>): Promise<Duplicate | undefined> {
  const manual = await findManualDuplicate(d, database);
  if (manual) return { kind: 'manual', tx: manual };
  const instalment = await findInstalmentMatch(d, database, taken);
  return instalment ? { kind: 'instalment', tx: instalment } : undefined;
}
