import '@/test/setup-db';
import { beforeEach, describe, expect, it } from 'vitest';
import { alive, BudgyDB } from '@/core/db/db';
import { saveTx } from '@/features/transactions/txRecord';
import type { CreditCard, Transaction } from '@/shared/models';
import { convertToPlan, createPlan, deletePlan, instalmentDates, payOffPlan, splitAmount } from './instalments';

const database = new BudgyDB('t-instalments');
const credit: CreditCard = { statementDay: 25, dueDay: 20 };
const ymd = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate()];
const purchase: Omit<Transaction, 'id'> = {
  type: 'expense',
  amount: 1000,
  currency: 'EGP',
  accountId: 'card',
  categoryId: 'phone',
  note: 'Phone',
  date: new Date(2026, 0, 31, 12).toISOString(),
  createdAt: '2026-01-31T10:00:00.000Z',
};
const byDate = (a: Transaction, b: Transaction) => a.date.localeCompare(b.date);
const live = async () => (await database.transactions.toArray()).filter(alive).sort(byDate);

describe('instalments', () => {
  beforeEach(async () => {
    await database.transactions.clear();
    await database.recurring.clear();
  });

  it('splits so the parts add up', () => {
    expect(splitAmount(1000, 3, 'EGP')).toEqual([333.33, 333.33, 333.34]);
  });

  it('dates each instalment from the purchase', () => {
    expect(instalmentDates(new Date(2026, 0, 31, 12).toISOString(), 4).map((d) => ymd(new Date(d)))).toEqual([
      [2026, 1, 31],
      [2026, 2, 28],
      [2026, 3, 31],
      [2026, 4, 30],
    ]);
  });

  it('createPlan adds one expense per month linked to the plan, and no payment ahead', async () => {
    const id = await createPlan(purchase, { months: 3, feeNote: 'fee', credit }, database);
    const txs = await live();
    expect(txs.map((t) => [t.amount, t.instalment?.n, t.instalment?.of, t.instalment?.planId])).toEqual([
      [333.33, 1, 3, id],
      [333.33, 2, 3, id],
      [333.34, 3, 3, id],
    ]);
    expect(txs.every((t) => t.type === 'expense' && t.categoryId === 'phone' && t.note === 'Phone')).toBe(true);
  });

  it('adds the fee as its own expense on the purchase day', async () => {
    await createPlan(purchase, { months: 3, fee: 50, feeCategoryId: 'bills', feeNote: 'Instalment fee · Phone', credit }, database);
    const fee = (await live()).find((t) => !t.instalment)!;
    expect(fee).toMatchObject({ amount: 50, categoryId: 'bills', note: 'Instalment fee · Phone', date: purchase.date, accountId: 'card' });
  });

  // 31 Jan lands on the 25 Feb statement, due 20 Mar; 31 Mar lands on 25 Apr, due 20 May.
  it('sets up the automatic payment from each statement’s due date to the last one’s', async () => {
    const id = await createPlan(purchase, { months: 3, autoPayFrom: 'bank', feeNote: '', credit }, database);
    const [r] = await database.recurring.toArray();
    expect(r).toMatchObject({ planId: id, auto: true, unit: 'month', every: 1, start: '2026-03-20', next: '2026-03-20', until: '2026-05-20' });
    expect(r.tx).toMatchObject({ type: 'transfer', accountId: 'bank', toAccountId: 'card', amount: 333.33 });
    expect(await database.transactions.where('type').equals('transfer').count()).toBe(0);
  });

  it('convertToPlan keeps the purchase as instalment 1', async () => {
    const saved = await saveTx(purchase, undefined, database);
    await convertToPlan(saved, { months: 2, feeNote: '', credit }, database);
    const first = await database.transactions.get(saved.id!);
    expect(first).toMatchObject({ amount: 500, date: purchase.date, instalment: { n: 1, of: 2 } });
    expect((await live()).length).toBe(2);
  });

  it('payOffPlan moves what is still to come to now and stops the payment', async () => {
    const id = await createPlan(purchase, { months: 3, autoPayFrom: 'bank', feeNote: '', credit }, database);
    const now = new Date(2026, 1, 5, 9);
    expect(await payOffPlan(id, now, database)).toBe(2);
    expect((await live()).map((t) => t.date)).toEqual([purchase.date, now.toISOString(), now.toISOString()]);
    expect((await database.recurring.toArray()).filter(alive)).toEqual([]);
  });

  it('deletePlan removes every instalment and the payment', async () => {
    const id = await createPlan(purchase, { months: 3, autoPayFrom: 'bank', feeNote: '', credit }, database);
    expect(await deletePlan(id, database)).toBe(3);
    expect(await live()).toEqual([]);
    expect((await database.recurring.toArray()).filter(alive)).toEqual([]);
  });
});
