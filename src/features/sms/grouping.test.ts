import '@/test/setup-db';
import { beforeEach, describe, expect, it } from 'vitest';
import { alive, BudgyDB } from '@/core/db/db';
import { balancesOf, totalsOf } from '@/core/db/hooks';
import { cardStatus } from '@/core/utils/creditCard';
import type { SmsPending, Transaction } from '@/shared/models';
import { changeOn } from '@/core/utils/lending';
import { combineFlow, combineTexts, defaultNote, purchaseChoices, recentExpenses, takeOff } from './grouping';
import { linkIdOf } from './learning';

const database = new BudgyDB('t-grouping');
const conv = { base: 'EGP', rate: (c: string) => (c === 'EGP' ? 1 : c === 'USD' ? 50 : undefined) };

const item = (over: Partial<SmsPending> = {}): SmsPending => ({
  fingerprint: 'in1', smsId: '1', address: 'InstaPay', date: '2026-11-06T21:00:00.000Z', body: 'text', status: 'understood',
  amount: 200, currency: 'EGP', direction: 'in', merchant: 'Ali', ...over,
});

async function purchase(over: Partial<Transaction> = {}): Promise<Transaction> {
  const id = await database.transactions.add({
    type: 'expense', amount: 600, currency: 'EGP', accountId: 'card', categoryId: 'food', subcategoryId: 'akl', note: 'Dinner',
    date: '2026-11-06T20:00:00.000Z', createdAt: 'x', ...over,
  });
  return (await database.transactions.get(id))!;
}

const all = async () => (await database.transactions.toArray()).filter(alive);

beforeEach(async () => {
  await Promise.all([database.transactions.clear(), database.smsPending.clear(), database.smsLinks.clear(), database.merchantRules.clear()]);
  await database.categories.bulkPut([
    { id: 'food', name: 'Food', kind: 'expense', icon: 'restaurant', color: '#f00', order: 0 },
    { id: 'shopping', name: 'Shopping', kind: 'expense', icon: 'shirt', color: '#f0f', order: 1 },
    { id: 'salary', name: 'Salary', kind: 'income', icon: 'briefcase', color: '#0f0', order: 2 },
  ]);
});

describe('takeOff', () => {
  it('saves each text as money back on the purchase, all in one new group', async () => {
    const target = await purchase();
    const ali = item();
    const sara = item({ fingerprint: 'in2', merchant: 'Sara' });
    await database.smsPending.bulkPut([ali, sara]);

    const rows = await takeOff([{ item: ali, accountId: 'bank' }, { item: sara, accountId: 'bank' }], target, conv, database);

    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r).toMatchObject({ type: 'income', moneyBack: true, categoryId: 'food', subcategoryId: 'akl', accountId: 'bank', amount: 200 });
    }
    expect(rows.map((r) => r.note)).toEqual(['Ali', 'Sara']);
    const groupId = (await database.transactions.get(target.id!))?.groupId;
    expect(groupId).toBeTruthy();
    expect(rows.every((r) => r.groupId === groupId)).toBe(true);
    expect(await database.smsPending.count()).toBe(0);
    expect((await database.smsLinks.get(await linkIdOf('InstaPay')))?.accountId).toBe('bank');
    expect(await database.merchantRules.count()).toBe(0);
  });

  it("joins the purchase's group when it already has one", async () => {
    const target = await purchase({ groupId: 'g1' });
    const [row] = await takeOff([{ item: item(), accountId: 'bank' }], target, conv, database);
    expect(row.groupId).toBe('g1');
  });

  it('saves a text only once when run twice', async () => {
    const target = await purchase();
    await takeOff([{ item: item(), accountId: 'bank' }], target, conv, database);
    await takeOff([{ item: item(), accountId: 'bank' }], (await database.transactions.get(target.id!))!, conv, database);
    expect((await all()).filter((t) => t.moneyBack)).toHaveLength(1);
  });

  it('writes nothing when a text is money out', async () => {
    const target = await purchase();
    await expect(takeOff([{ item: item(), accountId: 'bank' }, { item: item({ fingerprint: 'out', direction: 'out' }), accountId: 'bank' }], target, conv, database))
      .rejects.toThrow();
    expect(await all()).toHaveLength(1);
    expect((await database.transactions.get(target.id!))?.groupId).toBeUndefined();
  });

  it('writes nothing when the purchase is not an expense', async () => {
    const target = await purchase({ type: 'income' });
    await expect(takeOff([{ item: item(), accountId: 'bank' }], target, conv, database)).rejects.toThrow();
    expect(await all()).toHaveLength(1);
  });

  it('takes money back in another currency off at its value in the main currency', async () => {
    const target = await purchase();
    const [row] = await takeOff([{ item: item({ amount: 4, currency: 'USD' }), accountId: 'bank' }], target, conv, database);
    expect(row).toMatchObject({ rate: 50, rateCurrency: 'EGP' });
    const toBase = (n: number, c: string) => n * (conv.rate(c) ?? 0);
    expect(totalsOf([target, row], { base: 'EGP', toBase }).expense).toBe(400);
  });
});

describe('recentExpenses', () => {
  it('lists the live expenses of the last days, newest first', async () => {
    const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
    const older = await purchase({ date: daysAgo(10) });
    const newer = await purchase({ date: daysAgo(1) });
    await purchase({ date: daysAgo(40) });
    await purchase({ date: daysAgo(2), type: 'income' });
    await purchase({ date: daysAgo(2), type: 'transfer', toAccountId: 'bank' });
    await purchase({ date: daysAgo(2), deletedAt: daysAgo(1) });
    expect((await recentExpenses(30, database)).map((t) => t.id)).toEqual([newer.id, older.id]);
  });
});

describe('combineTexts', () => {
  const out = (over: Partial<SmsPending> = {}) => item({ fingerprint: 'out1', address: 'CIB', direction: 'out', amount: 600, merchant: 'Pizza Place', ...over });
  const toBase = (n: number, c: string) => n * (conv.rate(c) ?? 0);

  it('makes a payment and the money paid back one entry, netting the spending', async () => {
    const parts = [out(), item(), item({ fingerprint: 'in2', merchant: 'Sara' })].map((x) => ({ item: x, accountId: x.direction === 'out' ? 'card' : 'bank' }));
    await database.smsPending.bulkPut(parts.map((p) => p.item));
    const rows = await combineTexts(parts, { categoryId: 'food', moneyBack: false, note: 'Dinner' }, conv, database);

    expect(rows.map((r) => [r.type, !!r.moneyBack, r.accountId])).toEqual([['expense', false, 'card'], ['income', true, 'bank'], ['income', true, 'bank']]);
    expect(new Set(rows.map((r) => r.groupId)).size).toBe(1);
    expect(rows[0].groupId).toBeTruthy();
    expect(rows.every((r) => r.categoryId === 'food' && r.note === 'Dinner')).toBe(true);
    expect(totalsOf(rows, { base: 'EGP', toBase }).expense).toBe(200);
    expect(await database.smsPending.count()).toBe(0);
    expect(await database.merchantRules.count()).toBe(1);
  });

  it('makes one purchase paid from two cards, each card moving by its own text', async () => {
    const parts = [
      { item: out({ amount: 300 }), accountId: 'card1' },
      { item: out({ fingerprint: 'out2', address: 'NBE', amount: 200 }), accountId: 'card2' },
    ];
    const rows = await combineTexts(parts, { categoryId: 'shopping', moneyBack: false }, conv, database);
    expect(totalsOf(rows, { base: 'EGP', toBase }).expense).toBe(500);
    expect(rows.flatMap((r) => changeOn(r, 'card1'))).toEqual([[-300, 'EGP']]);
    expect(rows.flatMap((r) => changeOn(r, 'card2'))).toEqual([[-200, 'EGP']]);
  });

  it('keeps texts of money in as income in an income category', async () => {
    const parts = [item(), item({ fingerprint: 'in2' })].map((x) => ({ item: x, accountId: 'bank' }));
    const rows = await combineTexts(parts, { categoryId: 'salary', moneyBack: false }, conv, database);
    expect(rows.every((r) => r.type === 'income' && !r.moneyBack && r.categoryId === 'salary')).toBe(true);
    expect(await database.merchantRules.count()).toBe(0);
  });

  it('makes texts of money in money back when asked', async () => {
    const parts = [item(), item({ fingerprint: 'in2' })].map((x) => ({ item: x, accountId: 'bank' }));
    const rows = await combineTexts(parts, { categoryId: 'food', moneyBack: true }, conv, database);
    expect(rows.every((r) => r.type === 'income' && r.moneyBack)).toBe(true);
  });

  it('writes nothing when the category does not take the spending', async () => {
    const parts = [{ item: out(), accountId: 'card' }, { item: item(), accountId: 'bank' }];
    await expect(combineTexts(parts, { categoryId: 'salary', moneyBack: false }, conv, database)).rejects.toThrow();
    expect(await all()).toHaveLength(0);
  });

  it('needs two texts, each with an account', async () => {
    await expect(combineTexts([{ item: out(), accountId: 'card' }], { categoryId: 'food', moneyBack: false }, conv, database)).rejects.toThrow();
    await expect(combineTexts([{ item: out(), accountId: 'card' }, { item: item(), accountId: '' }], { categoryId: 'food', moneyBack: false }, conv, database)).rejects.toThrow();
    expect(await all()).toHaveLength(0);
  });

  it('skips the texts already added only when the combined entry is saved', async () => {
    const parts = [{ item: out(), accountId: 'card' }, { item: item(), accountId: 'bank' }];
    const dupe = item({ fingerprint: 'dupe' });
    await database.smsPending.bulkPut([...parts.map((p) => p.item), dupe]);
    await database.smsSeen.clear();

    await expect(combineTexts(parts, { categoryId: 'salary', moneyBack: false }, conv, database, [dupe])).rejects.toThrow();
    expect(await database.smsPending.get('dupe')).toBeTruthy();
    expect(await database.smsSeen.count()).toBe(0);

    await combineTexts(parts, { categoryId: 'food', moneyBack: false }, conv, database, [dupe]);
    expect(await database.smsPending.get('dupe')).toBeUndefined();
    expect(await database.smsSeen.get('dupe')).toMatchObject({ outcome: 'duplicate' });
  });

  it('leaves each account and card statement moving by exactly its own texts', async () => {
    const card = { id: 'card', name: 'Card', type: 'card' as const, icon: 'card', color: '#000', currency: 'EGP', initialBalance: 0, order: 0, createdAt: 'x', credit: { statementDay: 1, dueDay: 20 } };
    const bank = { ...card, id: 'bank', name: 'Bank', type: 'bank' as const, credit: undefined };
    const parts = [
      { item: out({ date: '2026-11-06T20:00:00.000Z' }), accountId: 'card' },
      { item: item({ date: '2026-11-06T21:00:00.000Z' }), accountId: 'bank' },
      { item: item({ fingerprint: 'refund', amount: 100, date: '2026-11-06T22:00:00.000Z' }), accountId: 'card' },
    ];
    const rows = await combineTexts(parts, { categoryId: 'food', moneyBack: false }, conv, database);

    const balances = balancesOf([card, bank], rows);
    expect(balances.get('card')).toEqual({ EGP: -500 });
    expect(balances.get('bank')).toEqual({ EGP: 200 });
    expect(cardStatus(card, rows, new Date('2026-11-10T12:00:00.000Z')).byCurrency.EGP).toMatchObject({ owed: 500, paid: 100 });
  });

  it('saves texts only once when run twice', async () => {
    const parts = [{ item: out(), accountId: 'card' }, { item: item(), accountId: 'bank' }];
    await combineTexts(parts, { categoryId: 'food', moneyBack: false }, conv, database);
    await combineTexts(parts, { categoryId: 'food', moneyBack: false }, conv, database);
    expect(await all()).toHaveLength(2);
  });

  it('works out the flow and the note from the texts', () => {
    expect(combineFlow([item(), out()])).toBe('expense');
    expect(combineFlow([item(), item({ fingerprint: 'in2' })])).toBe('income');
    expect(defaultNote([item(), out({ amount: 100, merchant: 'Small' }), out({ fingerprint: 'o2', amount: 600, merchant: 'Big' })])).toBe('Big');
    expect(defaultNote([item({ merchant: undefined }), item({ fingerprint: 'in2', merchant: 'Sara' })])).toBe('Sara');
  });
});

describe('purchaseChoices', () => {
  const row = (id: string, amount: number, over: Partial<Transaction> = {}): Transaction =>
    ({ id, type: 'expense', amount, currency: 'EGP', accountId: 'card', categoryId: 'food', date: '2026-11-06T20:00:00.000Z', createdAt: 'x', ...over });

  it('lists a purchase paid from two cards once, with its total, where its newest row was', () => {
    const choices = purchaseChoices([row('a', 50), row('b', 300, { groupId: 'g' }), row('c', 20), row('d', 200, { groupId: 'g' })]);
    expect(choices.map((c) => [c.tx.id, c.total, c.parts])).toEqual([['a', 50, 1], ['b', 500, 2], ['c', 20, 1]]);
  });

  it('gives no total when a group mixes currencies', () => {
    const [choice] = purchaseChoices([row('b', 300, { groupId: 'g' }), row('d', 4, { groupId: 'g', currency: 'USD' })]);
    expect(choice).toMatchObject({ total: undefined, parts: 2 });
  });
});
