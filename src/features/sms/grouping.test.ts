import '@/test/setup-db';
import { beforeEach, describe, expect, it } from 'vitest';
import { alive, BudgyDB } from '@/core/db/db';
import { totalsOf } from '@/core/db/hooks';
import type { SmsPending, Transaction } from '@/shared/models';
import { recentExpenses, takeOff } from './grouping';
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
