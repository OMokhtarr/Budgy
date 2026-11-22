import '@/test/setup-db';
import { beforeEach, describe, expect, it } from 'vitest';
import { alive, BudgyDB } from '@/core/db/db';
import { saveTx } from '@/features/transactions/txRecord';
import { addCashFee, cashFeeToSave } from './cashFee';

const database = new BudgyDB('t-cash-fee');
const base = { withdrawal: true, removed: false, currency: 'EGP' };

describe('cashFeeToSave', () => {
  it('takes the fee worked out from the rule', () => {
    expect(cashFeeToSave({ ...base, fromRule: 20 })).toBe(20);
  });

  it('keeps a typed fee over the rule’s, in any digits', () => {
    expect(cashFeeToSave({ ...base, typed: '٢٥', fromRule: 20 })).toBe(25);
  });

  it('saves nothing for a fee of 0, an empty one, a removed one, or a transfer that isn’t a withdrawal', () => {
    expect(cashFeeToSave({ ...base, typed: '0', fromRule: 20 })).toBeUndefined();
    expect(cashFeeToSave({ ...base, typed: '' })).toBeUndefined();
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
