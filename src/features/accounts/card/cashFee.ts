import { db, type BudgyDB } from '@/core/db/db';
import { roundTo } from '@/core/utils/currency';
import { parseNumber } from '@/core/utils/number';
import { saveTx } from '@/features/transactions/txRecord';
import type { Transaction } from '@/shared/models';

export interface CashFeeInput {
  /** Whether the transfer being saved takes cash out on a credit card. */
  withdrawal: boolean;
  /** The user took the fee off. */
  removed: boolean;
  /** The fee as the user typed it; wins over the rule's, so it stays when the amount changes. */
  typed?: string;
  /** The fee worked out from the card's rule. */
  fromRule?: number;
  currency: string;
}

/** The cash withdrawal fee to save with the transfer, if any. */
export function cashFeeToSave({ withdrawal, removed, typed, fromRule, currency }: CashFeeInput): number | undefined {
  if (!withdrawal || removed) return undefined;
  const fee = typed != null ? roundTo(parseNumber(typed), currency) : fromRule;
  return fee != null && fee > 0 ? fee : undefined;
}

/**
 * Adds the bank's fee for a cash withdrawal as its own expense on the card, on the withdrawal's date. It isn't
 * grouped with the transfer: a group counts a transfer as money back.
 */
export async function addCashFee(
  transfer: Transaction,
  fee: number,
  o: { categoryId?: string; note: string },
  database: BudgyDB = db,
): Promise<Transaction> {
  const now = new Date().toISOString();
  return saveTx(
    {
      type: 'expense',
      amount: fee,
      currency: transfer.currency,
      accountId: transfer.accountId,
      categoryId: o.categoryId,
      note: o.note,
      date: transfer.date,
      createdAt: now,
      updatedAt: now,
    },
    undefined,
    database,
  );
}
