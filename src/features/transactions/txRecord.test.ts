import '@/test/setup-db';
import { beforeEach, describe, expect, it } from 'vitest';
import { BudgyDB } from '@/core/db/db';
import { buildTxRecord, saveTx, type TxDraft } from './txRecord';

const database = new BudgyDB('t-tx-record');

const draft = (over: Partial<TxDraft> = {}): TxDraft => ({
  type: 'expense',
  amount: 450,
  currency: 'EGP',
  accountId: 'acc',
  categoryId: 'cat',
  date: '2026-11-03T10:15:00.000Z',
  ...over,
});

describe('buildTxRecord', () => {
  beforeEach(() => database.transactions.clear());

  it('drops transfer fields from an expense and category/rate from a transfer', () => {
    const transferBits = { toAccountId: 'acc2', toAmount: 20, toCurrency: 'USD' };
    const rate = { rate: 50, rateCurrency: 'EGP' };
    const expense = buildTxRecord(draft({ ...transferBits, currency: 'USD', rate, subcategoryId: 'sub' }));
    expect(expense).toMatchObject({ categoryId: 'cat', subcategoryId: 'sub', rate: 50, rateCurrency: 'EGP' });
    expect(expense.toAccountId).toBeUndefined();
    expect(expense.toAmount).toBeUndefined();
    expect(expense.toCurrency).toBeUndefined();

    const transfer = buildTxRecord(draft({ ...transferBits, type: 'transfer', rate, subcategoryId: 'sub' }));
    expect(transfer).toMatchObject(transferBits);
    expect(transfer.categoryId).toBeUndefined();
    expect(transfer.subcategoryId).toBeUndefined();
    expect(transfer.rate).toBeUndefined();
    expect(transfer.rateCurrency).toBeUndefined();
  });

  it('trims the note to 120 characters and drops an empty one', () => {
    expect(buildTxRecord(draft({ note: `  ${'x'.repeat(130)}  ` })).note).toBe('x'.repeat(120));
    expect(buildTxRecord(draft({ note: '  Lunch ' })).note).toBe('Lunch');
    expect(buildTxRecord(draft({ note: '   ' })).note).toBeUndefined();
    expect(buildTxRecord(draft()).note).toBeUndefined();
  });

  it('keeps smsFingerprint and createdAt when editing', async () => {
    const record = buildTxRecord(draft({ smsFingerprint: 'fp1', createdAt: '2026-01-01T00:00:00.000Z' }));
    expect(record).toMatchObject({ smsFingerprint: 'fp1', createdAt: '2026-01-01T00:00:00.000Z' });
    expect(record.updatedAt! > record.createdAt).toBe(true);

    const saved = await saveTx(record, 't1', database);
    expect(saved.id).toBe('t1');
    expect(await database.transactions.get('t1')).toMatchObject({
      smsFingerprint: 'fp1',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('keeps a currency the account does not hold', async () => {
    await database.accounts.add({ id: 'acc', name: 'CIB Card', currency: 'EGP' } as never);
    const saved = await saveTx(buildTxRecord(draft({ amount: 20, currency: 'USD' })), undefined, database);
    expect(saved.id).toBeTruthy();
    expect(await database.transactions.get(saved.id!)).toMatchObject({ amount: 20, currency: 'USD', accountId: 'acc' });
  });
});
