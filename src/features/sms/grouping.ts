import type { Converter } from '@/core/contexts/SettingsContext';
import { alive, db, type BudgyDB } from '@/core/db/db';
import { categoryFits } from '@/core/db/hooks';
import { roundTo } from '@/core/utils/currency';
import { newId } from '@/core/utils/id';
import { rateToSave } from '@/core/utils/txRate';
import { buildTxRecord, saveTx } from '@/features/transactions/txRecord';
import type { Flow, SmsPending, Transaction } from '@/shared/models';
import { learn, lessonIdsOf, type LessonIds } from './learning';

/** A bank text and the account it goes on, as picked on its card or in a sheet. */
export interface TextPart {
  item: SmsPending;
  accountId: string;
}

type Conv = Pick<Converter, 'base' | 'rate'>;

const understood = (item: SmsPending): item is SmsPending & { amount: number; currency: string } =>
  item.status === 'understood' && !!item.amount && item.amount > 0 && !!item.currency;

/**
 * Takes texts of money in off a saved purchase (friends paying their share): each becomes money back in the
 * purchase's category, on its own account, and joins the purchase's group (a new one, written onto the purchase
 * too, if it had none). Learns each text's sender link and drops it from review. All or nothing; a text saved
 * before isn't saved again.
 */
export async function takeOff(parts: TextPart[], target: Transaction, conv: Conv, database: BudgyDB = db): Promise<Transaction[]> {
  if (target.type !== 'expense' || !alive(target) || target.id == null) throw new Error('Money can only come back on a saved expense');
  if (!parts.length || parts.some((p) => !understood(p.item) || p.item.direction !== 'in' || !p.accountId)) {
    throw new Error('Only texts of money in, each with an account, can be taken off a purchase');
  }
  const targetId = target.id;
  const groupId = target.groupId ?? newId();
  const records = parts.map(({ item, accountId }) => {
    const { amount, currency } = item as SmsPending & { amount: number; currency: string };
    return buildTxRecord({
      type: 'income',
      moneyBack: true,
      amount,
      currency,
      accountId,
      categoryId: target.categoryId,
      subcategoryId: target.subcategoryId,
      date: item.date,
      note: item.merchant ?? target.note,
      smsFingerprint: item.fingerprint,
      groupId,
      rate: rateToSave({ saved: conv.rate(currency), currency, base: conv.base }),
    });
  });
  const lessons = await Promise.all(records.map((r, i) => lessonIdsOf(parts[i].item, r)));
  return saveTexts(parts, records, lessons, database, async () => {
    if (!target.groupId) await database.transactions.update(targetId, { groupId });
  });
}

/**
 * Saves each text's record (once: one saved before is returned instead), learns from it and drops it from review,
 * after `first`, all in one Dexie transaction. The lesson ids are hashed beforehand: a Dexie transaction can't
 * wait on crypto.
 */
function saveTexts(
  parts: TextPart[],
  records: Omit<Transaction, 'id'>[],
  lessons: LessonIds[],
  database: BudgyDB,
  first?: () => Promise<void>,
): Promise<Transaction[]> {
  const tables = [database.transactions, database.smsLinks, database.merchantRules, database.smsPending, database.smsSeen];
  return database.transaction('rw', tables, async () => {
    await first?.();
    const saved: Transaction[] = [];
    for (const [i, record] of records.entries()) {
      const tx = await saveTx(record, undefined, database);
      await learn(database, parts[i].item, tx, lessons[i]);
      saved.push(tx);
    }
    return saved;
  });
}

/** What a combined entry is: its category (and subcategory), whether money in is money back, and its note. */
export interface CombineChoice {
  categoryId: string;
  subcategoryId?: string;
  moneyBack: boolean;
  note?: string;
}

/** A combined entry is spending when any text is money out; otherwise it's money in. */
export const combineFlow = (items: SmsPending[]): Flow => (items.some((x) => x.direction !== 'in') ? 'expense' : 'income');

/** The note a combined entry starts with: the merchant of the largest payment, or else the first merchant. */
export function defaultNote(items: SmsPending[]): string | undefined {
  const outs = items.filter((x) => x.direction !== 'in' && x.merchant).sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
  return outs[0]?.merchant ?? items.find((x) => x.merchant)?.merchant;
}

/**
 * Saves several texts as one entry: rows on their own accounts, sharing a new group, the category, subcategory and
 * note. Money out is spending; money in is money back on it (or, when every text is money in, income, or money
 * back when `moneyBack`). The category must take that spending or income. Merchant categories are learned from the
 * payments only; every sender's link is learned. `skipped` (texts the user said were already added) are set aside
 * as duplicates in the same go. All or nothing; a text saved before isn't saved again.
 */
export async function combineTexts(
  parts: TextPart[],
  choice: CombineChoice,
  conv: Conv,
  database: BudgyDB = db,
  skipped: SmsPending[] = [],
): Promise<Transaction[]> {
  if (parts.length < 2 || parts.some((p) => !understood(p.item) || !p.accountId)) {
    throw new Error('Combining needs two or more texts that were read, each with an account');
  }
  const spending = combineFlow(parts.map((p) => p.item)) === 'expense' || choice.moneyBack;
  const category = await database.categories.get(choice.categoryId);
  if (!category || !alive(category) || !categoryFits(category, spending ? 'expense' : 'income')) {
    throw new Error("The category doesn't take this entry");
  }
  const groupId = newId();
  const records = parts.map(({ item, accountId }) => {
    const { amount, currency } = item as SmsPending & { amount: number; currency: string };
    const out = item.direction !== 'in';
    return buildTxRecord({
      type: out ? 'expense' : 'income',
      moneyBack: !out && spending,
      amount,
      currency,
      accountId,
      categoryId: choice.categoryId,
      subcategoryId: choice.subcategoryId,
      date: item.date,
      note: choice.note,
      smsFingerprint: item.fingerprint,
      groupId,
      rate: rateToSave({ saved: conv.rate(currency), currency, base: conv.base }),
    });
  });
  const lessons = await Promise.all(
    records.map(async (r, i) => {
      const ids = await lessonIdsOf(parts[i].item, r);
      return r.type === 'expense' ? ids : { linkId: ids.linkId };
    }),
  );
  const at = new Date().toISOString();
  return saveTexts(parts, records, lessons, database, async () => {
    for (const item of skipped) {
      await database.smsSeen.put({ fingerprint: item.fingerprint, outcome: 'duplicate', at });
      await database.smsPending.delete(item.fingerprint);
    }
  });
}

/** The live expenses of the last `days` days, newest first: the purchases money can come back on. */
export async function recentExpenses(days: number, database: BudgyDB = db): Promise<Transaction[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const rows = await database.transactions.where('date').aboveOrEqual(since).filter((t) => alive(t) && t.type === 'expense').toArray();
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

/** A purchase money can come back on: one row, or the rows of one group (e.g. paid from two cards). */
export interface PurchaseChoice {
  /** The row picked to stand for it; taking money off it joins its group. */
  tx: Transaction;
  /** What the rows add up to, when they share one currency. */
  total?: number;
  parts: number;
}

/** One choice per purchase, in the order given: a group's rows show once, where its first (newest) row was. */
export function purchaseChoices(txs: Transaction[]): PurchaseChoice[] {
  const byGroup = new Map<string, Transaction[]>();
  for (const t of txs) if (t.groupId) byGroup.set(t.groupId, [...(byGroup.get(t.groupId) ?? []), t]);
  const out: PurchaseChoice[] = [];
  for (const t of txs) {
    const rows = t.groupId ? byGroup.get(t.groupId)! : [t];
    if (rows[0] !== t) continue;
    const oneCurrency = rows.every((r) => r.currency === t.currency);
    out.push({ tx: t, total: oneCurrency ? roundTo(rows.reduce((s, r) => s + r.amount, 0), t.currency) : undefined, parts: rows.length });
  }
  return out;
}
