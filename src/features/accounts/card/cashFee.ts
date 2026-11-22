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
  /**
   * The fee as the user typed it, in the currency it was typed for. It wins over the rule's, so it stays when the
   * amount changes, but not when the currency does: 20 typed for EGP isn't 20 in USD.
   */
  typed?: { text: string; currency: string };
  /** The fee worked out from the card's rule. */
  fromRule?: number;
  currency: string;
}

/** The cash withdrawal fee to save with the transfer, if any. */
export function cashFeeToSave({ withdrawal, removed, typed, fromRule, currency }: CashFeeInput): number | undefined {
  if (!withdrawal || removed) return undefined;
  const fee = typed?.currency === currency ? roundTo(parseNumber(typed.text), currency) : fromRule;
  return fee != null && fee > 0 ? fee : undefined;
}

/**
 * Saves a new cash withdrawal and, with a fee, the fee, together: neither is saved if the other fails. A bank text
 * already saved returns its transaction and adds no second fee.
 */
export async function saveWithCashFee(
  withdrawal: Omit<Transaction, 'id'>,
  fee: number | undefined,
  o: { categoryId?: string; note: string },
  database: BudgyDB = db,
): Promise<Transaction> {
  return database.transaction('rw', database.transactions, async () => {
    const fingerprint = withdrawal.smsFingerprint;
    const existing = fingerprint ? await database.transactions.where('smsFingerprint').equals(fingerprint).first() : undefined;
    if (existing) return existing;
    const saved = await saveTx(withdrawal, undefined, database);
    if (fee != null) await addCashFee(saved, fee, o, database);
    return saved;
  });
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
