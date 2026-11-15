import type { Converter } from '@/core/contexts/SettingsContext';
import { alive, db, type BudgyDB } from '@/core/db/db';
import { newId } from '@/core/utils/id';
import { rateToSave } from '@/core/utils/txRate';
import { buildTxRecord, saveTx } from '@/features/transactions/txRecord';
import type { SmsPending, Transaction } from '@/shared/models';
import { learn, lessonIdsOf } from './learning';

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
  // Hashed up front: a Dexie transaction can't wait on crypto.
  const lessons = await Promise.all(records.map((r, i) => lessonIdsOf(parts[i].item, r)));

  return database.transaction('rw', database.transactions, database.smsLinks, database.merchantRules, database.smsPending, async () => {
    if (!target.groupId) await database.transactions.update(targetId, { groupId });
    const saved: Transaction[] = [];
    for (const [i, record] of records.entries()) {
      const tx = await saveTx(record, undefined, database);
      await learn(database, parts[i].item, tx, lessons[i]);
      saved.push(tx);
    }
    return saved;
  });
}

/** The live expenses of the last `days` days, newest first: the purchases money can come back on. */
export async function recentExpenses(days: number, database: BudgyDB = db): Promise<Transaction[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const rows = await database.transactions.where('date').aboveOrEqual(since).filter((t) => alive(t) && t.type === 'expense').toArray();
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}
