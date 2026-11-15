import { alive, db, softDelete } from '@/core/db/db';
import { categoryFits } from '@/core/db/hooks';
import { currenciesOf } from '@/core/utils/currency';
import { flowOfTx } from '@/core/utils/flow';
import type { Account, Category, Transaction } from '@/shared/models';

/** Changes for several selected transactions at once. Each returns how many had to be skipped. */

/** Moves transactions to another day ("YYYY-MM-DD"), keeping each one's time of day. */
export async function moveToDay(txs: Transaction[], day: string): Promise<number> {
  const [y, m, d] = day.split('-').map(Number);
  await db.transaction('rw', db.transactions, async () => {
    for (const x of txs) {
      const old = new Date(x.date);
      const date = new Date(y, m - 1, d, old.getHours(), old.getMinutes(), old.getSeconds()).toISOString();
      await db.transactions.update(x.id!, { date });
    }
  });
  return 0;
}

/**
 * Moves transactions (the source side, for transfers) to another account. Skips those in a currency
 * the account doesn't hold, and transfers that would end up going from an account to itself.
 */
export async function moveToAccount(txs: Transaction[], account: Account): Promise<number> {
  const held = currenciesOf(account);
  let skipped = 0;
  await db.transaction('rw', db.transactions, async () => {
    for (const x of txs) {
      const toSelf = x.type === 'transfer' && x.toAccountId === account.id && !x.toCurrency;
      if (!held.includes(x.currency) || toSelf) {
        skipped++;
        continue;
      }
      await db.transactions.update(x.id!, { accountId: account.id! });
    }
  });
  return skipped;
}

/**
 * Recategorises expenses/income; skips transfers and transactions of a flow the category doesn't accept
 * (money back goes in expense categories).
 * A subcategory belongs to its category, so moving to a different one clears it.
 */
export async function moveToCategory(txs: Transaction[], category: Category): Promise<number> {
  let skipped = 0;
  await db.transaction('rw', db.transactions, async () => {
    for (const x of txs) {
      const flow = flowOfTx(x);
      if (!flow || !categoryFits(category, flow)) {
        skipped++;
        continue;
      }
      await db.transactions.update(x.id!, x.categoryId === category.id ? { categoryId: category.id! } : { categoryId: category.id!, subcategoryId: undefined });
    }
  });
  return skipped;
}

export async function deleteMany(txs: Transaction[]): Promise<void> {
  await softDelete(db.transactions, txs.map((x) => x.id!));
}

/** The live rows of a group, in any period, oldest first. */
export async function groupRows(groupId: string): Promise<Transaction[]> {
  const rows = await db.transactions.filter((x) => x.groupId === groupId && alive(x)).toArray();
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

/** Gives every row of a group one category (a group has one), clearing the subcategory unless it's kept. */
export async function setGroupCategory(groupId: string, categoryId: string, subcategoryId?: string): Promise<void> {
  await db.transaction('rw', db.transactions, async () => {
    for (const x of await groupRows(groupId)) await db.transactions.update(x.id!, { categoryId, subcategoryId });
  });
}

/** Takes a transaction out of its group; money back stays money back on its category. */
export async function ungroup(tx: Transaction): Promise<void> {
  await db.transactions.update(tx.id!, { groupId: undefined });
}

/** Deletes every row of a group. */
export async function deleteGroup(groupId: string): Promise<void> {
  await softDelete(db.transactions, (await groupRows(groupId)).map((x) => x.id!));
}

/** Gives every row of a group the note (trimmed to the editor's 120 characters; empty removes it). */
export async function setGroupNote(groupId: string, note: string): Promise<void> {
  const text = note.trim().slice(0, 120).trim() || undefined;
  await db.transaction('rw', db.transactions, async () => {
    for (const x of await groupRows(groupId)) await db.transactions.update(x.id!, { note: text });
  });
}
