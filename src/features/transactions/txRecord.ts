import { db, type BudgyDB } from '@/core/db/db';
import type { Transaction, TxType } from '@/shared/models';

/** The note's limit, as on the editor's note field. */
const NOTE_MAX = 120;

/** What the editor or a bank-text Confirm wants to save, before it becomes a record. */
export interface TxDraft {
  type: TxType;
  amount: number;
  currency: string;
  accountId: string;
  toAccountId?: string;
  toAmount?: number;
  toCurrency?: string;
  categoryId?: string;
  subcategoryId?: string;
  date: string;
  note?: string;
  smsFingerprint?: string;
  rate?: Pick<Transaction, 'rate' | 'rateCurrency'>;
  /** Kept from the transaction being edited. */
  createdAt?: string;
}

/**
 * The record to store: transfer-only fields only on transfers, category and rate only on expense/income,
 * note trimmed to 120 chars (undefined when empty), createdAt kept or now, updatedAt now.
 */
export function buildTxRecord(d: TxDraft): Omit<Transaction, 'id'> {
  const transfer = d.type === 'transfer';
  const now = new Date().toISOString();
  return {
    type: d.type,
    amount: d.amount,
    currency: d.currency,
    accountId: d.accountId,
    toAccountId: transfer ? d.toAccountId : undefined,
    toAmount: transfer ? d.toAmount : undefined,
    toCurrency: transfer ? d.toCurrency : undefined,
    categoryId: transfer ? undefined : d.categoryId,
    subcategoryId: transfer ? undefined : d.subcategoryId,
    ...(transfer ? {} : d.rate),
    date: d.date,
    note: d.note?.trim().slice(0, NOTE_MAX).trim() || undefined,
    smsFingerprint: d.smsFingerprint,
    createdAt: d.createdAt ?? now,
    // put() replaces the whole record, so set this here rather than relying on the update hook.
    updatedAt: now,
  };
}

/**
 * add() or, with an id, put(); returns the stored transaction with its id. A new transaction from a bank
 * text is added only once: if one with its fingerprint exists (even deleted), that one is returned instead.
 */
export async function saveTx(record: Omit<Transaction, 'id'>, id?: string, database: BudgyDB = db): Promise<Transaction> {
  if (id != null) {
    const tx = { ...record, id };
    await database.transactions.put(tx);
    return tx;
  }
  const fingerprint = record.smsFingerprint;
  if (!fingerprint) return { ...record, id: await database.transactions.add(record) };
  return database.transaction('rw', database.transactions, async () => {
    const existing = await database.transactions.where('smsFingerprint').equals(fingerprint).first();
    return existing ?? { ...record, id: await database.transactions.add(record) };
  });
}
