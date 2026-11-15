import { alive, db, type BudgyDB } from '@/core/db/db';
import { flowOfTx } from '@/core/utils/flow';
import type { Flow } from '@/shared/models';

/**
 * How many live transactions in the category are of the flow it would stop taking if it became `kind` only.
 * Money back counts as spending.
 */
export function usesOfOtherFlow(categoryId: string, kind: Flow, database: BudgyDB = db): Promise<number> {
  return database.transactions
    .where('categoryId')
    .equals(categoryId)
    .filter((x) => alive(x) && flowOfTx(x) != null && flowOfTx(x) !== kind)
    .count();
}
