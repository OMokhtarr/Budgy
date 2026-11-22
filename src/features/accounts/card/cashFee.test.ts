import '@/test/setup-db';
import { beforeEach, describe, expect, it } from 'vitest';
import { alive, BudgyDB } from '@/core/db/db';
import { saveTx } from '@/features/transactions/txRecord';
import { addCashFee, cashFeeToSave, saveWithCashFee } from './cashFee';

const database = new BudgyDB('t-cash-fee');
const base = { withdrawal: true, removed: false, currency: 'EGP' };

describe('cashFeeToSave', () => {
  it('takes the fee worked out from the rule', () => {
    expect(cashFeeToSave({ ...base, fromRule: 20 })).toBe(20);
  });

  it('keeps a typed fee over the rule’s, in any digits', () => {
    expect(cashFeeToSave({ ...base, typed: { text: '٢٥', currency: 'EGP' }, fromRule: 20 })).toBe(25);
  });

  it('drops a typed fee once the currency changes, back to the rule’s', () => {
    expect(cashFeeToSave({ ...base, currency: 'USD', typed: { text: '20', currency: 'EGP' }, fromRule: 6 })).toBe(6);
  });

  it('saves nothing for a fee of 0, an empty one, a removed one, or a transfer that isn’t a withdrawal', () => {
    expect(cashFeeToSave({ ...base, typed: { text: '0', currency: 'EGP' }, fromRule: 20 })).toBeUndefined();
    expect(cashFeeToSave({ ...base, typed: { text: '', currency: 'EGP' } })).toBeUndefined();
    expect(cashFeeToSave({ ...base, removed: true, fromRule: 20 })).toBeUndefined();
    expect(cashFeeToSave({ ...base, withdrawal: false, fromRule: 20 })).toBeUndefined();
  });
});

describe('addCashFee', () => {
  beforeEach(() => database.transactions.clear());

  it('adds the fee as its own expense on the card, on the withdrawal’s date', async () => {
    const date = new Date(2026, 10, 22, 14).toISOString();
    const transfer = await saveTx(
      { type: 'transfer', amount: 1000, currency: 'EGP', accountId: 'card', toAccountId: 'cash', date, createdAt: date },
      undefined,
      database,
    );
    await addCashFee(transfer, 20, { categoryId: 'bills', note: 'Cash withdrawal fee' }, database);
    const rows = (await database.transactions.toArray()).filter(alive);
    expect(rows).toHaveLength(2);
    const fee = rows.find((r) => r.type === 'expense')!;
    expect(fee).toMatchObject({ amount: 20, currency: 'EGP', accountId: 'card', categoryId: 'bills', note: 'Cash withdrawal fee', date });
    expect(fee.groupId).toBeUndefined();
  });
});

describe('saveWithCashFee', () => {
  beforeEach(() => database.transactions.clear());
  const date = new Date(2026, 10, 22, 14).toISOString();
  const withdrawal = { type: 'transfer' as const, amount: 1000, currency: 'EGP', accountId: 'card', toAccountId: 'cash', date, createdAt: date };
  const o = { categoryId: 'bills', note: 'Cash withdrawal fee' };
  const live = async () => (await database.transactions.toArray()).filter(alive);

  it('saves the withdrawal and its fee', async () => {
    const saved = await saveWithCashFee(withdrawal, 20, o, database);
    const rows = await live();
    expect(rows.map((r) => [r.type, r.amount]).sort()).toEqual([['expense', 20], ['transfer', 1000]]);
    expect(saved.type).toBe('transfer');
  });

  it('saves only the withdrawal without a fee', async () => {
    await saveWithCashFee(withdrawal, undefined, o, database);
    expect((await live()).map((r) => r.type)).toEqual(['transfer']);
  });

  it('adds no second fee when the same bank text is saved again', async () => {
    const fromText = { ...withdrawal, smsFingerprint: 'fp-atm' };
    const first = await saveWithCashFee(fromText, 20, o, database);
    const again = await saveWithCashFee(fromText, 20, o, database);
    expect(again.id).toBe(first.id);
    expect((await live()).map((r) => r.type).sort()).toEqual(['expense', 'transfer']);
  });
});
