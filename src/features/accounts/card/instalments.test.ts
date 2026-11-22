import '@/test/setup-db';
import { beforeEach, describe, expect, it } from 'vitest';
import { alive, BudgyDB } from '@/core/db/db';
import { saveTx } from '@/features/transactions/txRecord';
import type { Account, Category, CreditCard, Transaction } from '@/shared/models';
import {
  convertToPlan, createPlan, deletePlan, instalmentDates, parseFirst, parseMonths, payOffPlan, planParts, splitAmount, toPlanOptions,
} from './instalments';

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

  it('parseMonths takes whole numbers from 2 to 60, in any digits', () => {
    expect(parseMonths('12')).toBe(12);
    expect(parseMonths('٦')).toBe(6);
    for (const bad of ['', '1', '61', '2.5', 'x']) expect(parseMonths(bad)).toBeUndefined();
  });

  it('splits so the parts add up', () => {
    expect(splitAmount(1000, 3, 'EGP')).toEqual([333.33, 333.33, 333.34]);
  });

  it('never makes a part negative, even in a currency without decimals', () => {
    const parts = splitAmount(90, 60, 'JPY');
    expect(parts.reduce((a, b) => a + b, 0)).toBe(90);
    expect(Math.min(...parts)).toBe(1);
    expect(Math.max(...parts)).toBe(2);
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
    const id = (await createPlan(purchase, { months: 3, feeNote: 'fee', credit }, database)).instalment!.planId;
    const txs = await live();
    expect(txs.map((t) => [t.amount, t.instalment?.n, t.instalment?.of, t.instalment?.planId])).toEqual([
      [333.33, 1, 3, id],
      [333.33, 2, 3, id],
      [333.34, 3, 3, id],
    ]);
    expect(txs.every((t) => t.type === 'expense' && t.categoryId === 'phone' && t.note === 'Phone')).toBe(true);
  });

  it('returns instalment 1, and saves a bank text’s purchase only once', async () => {
    const fromText = { ...purchase, smsFingerprint: 'fp-1' };
    const first = await createPlan(fromText, { months: 3, feeNote: '', credit }, database);
    expect(first).toMatchObject({ amount: 333.33, smsFingerprint: 'fp-1', instalment: { n: 1, of: 3 } });
    expect(first.id).toBeDefined();
    const again = await createPlan(fromText, { months: 3, feeNote: '', credit }, database);
    expect(again.id).toBe(first.id);
    expect((await live()).length).toBe(3);
  });

  it('adds the fee as its own expense on the purchase day', async () => {
    await createPlan(purchase, { months: 3, fee: 50, feeCategoryId: 'bills', feeNote: 'Instalment fee · Phone', credit }, database);
    const fee = (await live()).find((t) => !t.instalment)!;
    expect(fee).toMatchObject({ amount: 50, categoryId: 'bills', note: 'Instalment fee · Phone', date: purchase.date, accountId: 'card' });
  });

  // 31 Jan lands on the 25 Feb statement, due 20 Mar; 31 Mar lands on 25 Apr, due 20 May.
  it('sets up the automatic payment from each statement’s due date to the last one’s', async () => {
    const id = (await createPlan(purchase, { months: 3, autoPayFrom: 'bank', feeNote: '', credit }, database)).instalment!.planId;
    const rules = (await database.recurring.toArray()).sort((a, b) => a.start.localeCompare(b.start));
    // 333.33 twice, then the last instalment's own 333.34.
    expect(rules.map((r) => [r.start, r.until, r.tx.amount])).toEqual([
      ['2026-03-20', '2026-04-20', 333.33],
      ['2026-05-20', '2026-05-20', 333.34],
    ]);
    expect(rules[0]).toMatchObject({ planId: id, auto: true, unit: 'month', every: 1, next: '2026-03-20' });
    expect(rules[0].tx).toMatchObject({ type: 'transfer', accountId: 'bank', toAccountId: 'card' });
    expect(rules[1]).toMatchObject({ planId: id, next: '2026-05-20' });
    expect(await database.transactions.where('type').equals('transfer').count()).toBe(0);
  });

  // Due 25 days after a statement on the 25th: 22 Mar, 19 Apr, 20 May, 19 Jun, 20 Jul, 19 Aug.
  it('pays on or before every due date, and all of them, when the due date moves with the month', async () => {
    const days = { statementDay: 25, dueDay: 20, dueAfter: 25 };
    const p = { ...purchase, amount: 6000, date: new Date(2027, 1, 1, 12).toISOString() };
    await createPlan(p, { months: 6, autoPayFrom: 'bank', feeNote: '', credit: days }, database);
    const rules = await database.recurring.toArray();
    expect(rules.map((r) => [r.start, r.until, r.tx.amount])).toEqual([['2027-03-19', '2027-08-19', 1000]]);
  });

  it('convertToPlan keeps the purchase as instalment 1', async () => {
    const saved = await saveTx(purchase, undefined, database);
    await convertToPlan(saved, { months: 2, feeNote: '', credit }, database);
    const first = await database.transactions.get(saved.id!);
    expect(first).toMatchObject({ amount: 500, date: purchase.date, instalment: { n: 1, of: 2 } });
    expect((await live()).length).toBe(2);
  });

  it('planParts repeats the amount from instalment n', () => {
    const parts = planParts(1000, 12, 'EGP', 3);
    expect(parts).toHaveLength(10);
    expect(parts.every((p) => p === 1000)).toBe(true);
    expect(planParts(1000, 3, 'EGP')).toEqual([333.33, 333.33, 333.34]);
  });

  it('parseFirst takes 1..months, in any digits', () => {
    expect(parseFirst('3', 12)).toBe(3);
    expect(parseFirst('٣', 12)).toBe(3);
    expect(parseFirst('12', 12)).toBe(12);
    for (const bad of ['', '0', '13', '2.5']) expect(parseFirst(bad, 12)).toBeUndefined();
    expect(parseFirst('3', undefined)).toBeUndefined();
  });

  it('createPlan from instalment 3 of 12 adds 3..12 at the amount', async () => {
    await createPlan(purchase, { months: 12, first: 3, feeNote: '', credit }, database);
    const txs = await live();
    expect(txs).toHaveLength(10);
    expect(txs.every((t) => t.amount === 1000 && t.instalment?.of === 12)).toBe(true);
    expect(txs.map((t) => t.instalment?.n)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(txs[0].date).toBe(purchase.date);
    expect(ymd(new Date(txs[1].date))).toEqual([2026, 2, 28]);
  });

  it('createPlan on the last instalment saves just that one', async () => {
    await createPlan(purchase, { months: 12, first: 12, autoPayFrom: 'bank', feeNote: '', credit }, database);
    const txs = await live();
    expect(txs.map((t) => t.instalment?.n)).toEqual([12]);
    expect((await database.recurring.toArray()).length).toBe(1);
  });

  it('adds no fee to a plan that started before instalment 1', async () => {
    await createPlan(purchase, { months: 12, first: 3, fee: 50, feeCategoryId: 'bills', feeNote: 'fee', credit }, database);
    expect((await live()).filter((t) => !t.instalment)).toEqual([]);
  });

  it('pays automatically only the instalments added', async () => {
    await createPlan(purchase, { months: 12, first: 3, autoPayFrom: 'bank', feeNote: '', credit }, database);
    const monthOf = (k: string) => Number(k.slice(0, 4)) * 12 + Number(k.slice(5, 7));
    const rules = await database.recurring.toArray();
    expect(rules.every((r) => r.tx.amount === 1000)).toBe(true);
    expect(rules.reduce((s, r) => s + monthOf(r.until!) - monthOf(r.start) + 1, 0)).toBe(10);
  });

  it('convertToPlan from instalment 3 keeps its amount', async () => {
    const saved = await saveTx(purchase, undefined, database);
    await convertToPlan(saved, { months: 12, first: 3, feeNote: '', credit }, database);
    expect(await database.transactions.get(saved.id!)).toMatchObject({ amount: 1000, date: purchase.date, instalment: { n: 3, of: 12 } });
    expect((await live()).length).toBe(10);
  });

  it('toPlanOptions picks Bills and the card’s settings', () => {
    const card = { id: 'card', credit } as Account;
    const cats = [
      { id: 'f', key: 'food', kind: 'expense' },
      { id: 'b', key: 'bills', kind: 'expense' },
    ] as Category[];
    expect(toPlanOptions({ months: 6, first: 2, autoPayFrom: 'bank' }, card, cats, 'note')).toEqual({
      months: 6, first: 2, autoPayFrom: 'bank', feeCategoryId: 'b', feeNote: 'note', credit,
    });
  });

  it('payOffPlan moves what is still to come to now and stops the payment', async () => {
    const id = (await createPlan(purchase, { months: 3, autoPayFrom: 'bank', feeNote: '', credit }, database)).instalment!.planId;
    const now = new Date(2026, 1, 5, 9);
    expect(await payOffPlan(id, now, database)).toBe(2);
    expect((await live()).map((t) => t.date)).toEqual([purchase.date, now.toISOString(), now.toISOString()]);
    expect((await database.recurring.toArray()).filter(alive)).toEqual([]);
  });

  it('deletePlan removes every instalment and the payment', async () => {
    const id = (await createPlan(purchase, { months: 3, autoPayFrom: 'bank', feeNote: '', credit }, database)).instalment!.planId;
    expect(await deletePlan(id, database)).toBe(3);
    expect(await live()).toEqual([]);
    expect((await database.recurring.toArray()).filter(alive)).toEqual([]);
  });
});
