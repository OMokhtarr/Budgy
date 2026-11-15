import type { Flow, Transaction } from '@/shared/models';

/** Money that came back on a purchase: income that lowers spending in its (expense) category. */
export const isMoneyBack = (t: Pick<Transaction, 'type' | 'moneyBack'>): boolean => t.type === 'income' && !!t.moneyBack;

/** Whether a transaction counts as spending or income; money back counts as (negative) spending, a transfer as neither. */
export function flowOfTx(t: Pick<Transaction, 'type' | 'moneyBack'>): Flow | undefined {
  if (t.type === 'transfer') return undefined;
  return isMoneyBack(t) ? 'expense' : t.type;
}
