import { db, softDelete } from '@/core/db/db';
import { categoryFits } from '@/core/db/hooks';
import { currenciesOf } from '@/core/utils/currency';
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
 * Recategorises expenses/income; skips transfers and transactions of a type the category doesn't accept.
 * A subcategory belongs to its category, so moving to a different one clears it.
 */
export async function moveToCategory(txs: Transaction[], category: Category): Promise<number> {
  let skipped = 0;
  await db.transaction('rw', db.transactions, async () => {
    for (const x of txs) {
      if (x.type === 'transfer' || !categoryFits(category, x.type)) {
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
