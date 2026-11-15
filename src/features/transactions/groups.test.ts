import { describe, expect, it } from 'vitest';
import type { Transaction } from '@/shared/models';
import { foldGroups, groupFlows } from './groups';

const CONV = { base: 'EGP', toBase: (n: number, cur: string) => (cur === 'USD' ? n * 50 : n) };

let n = 0;
const tx = (amount: number, over: Partial<Transaction> = {}): Transaction => ({
  id: `t${++n}`, type: 'expense', amount, currency: 'EGP', accountId: 'card', categoryId: 'food', date: '2026-11-06T20:00:00.000Z', createdAt: 'x', ...over,
});
const back = (amount: number, over: Partial<Transaction> = {}) => tx(amount, { type: 'income', moneyBack: true, accountId: 'bank', ...over });
const ids = (entries: ReturnType<typeof foldGroups>) => entries.map((e) => (e.kind === 'tx' ? e.tx.id : e.groupId));

describe('foldGroups', () => {
  it('leaves a list without groups as it is', () => {
    const list = [tx(10), tx(20)];
    expect(foldGroups(list, CONV)).toEqual(list.map((t) => ({ kind: 'tx', tx: t })));
  });

  it('folds a purchase and the money paid back on it into one entry with the net', () => {
    const lunch = tx(50, { date: '2026-11-07T12:00:00.000Z' });
    const dinner = tx(600, { groupId: 'g', date: '2026-11-06T20:00:00.000Z' });
    const ali = back(200, { groupId: 'g', date: '2026-11-06T21:00:00.000Z' });
    const sara = back(200, { groupId: 'g', date: '2026-11-06T21:30:00.000Z' });
    const coffee = tx(30, { date: '2026-11-05T09:00:00.000Z' });

    const entries = foldGroups([lunch, sara, ali, dinner, coffee], CONV);

    expect(ids(entries)).toEqual([lunch.id, 'g', coffee.id]);
    const group = entries[1];
    expect(group).toMatchObject({ kind: 'group', groupId: 'g', flow: 'expense', net: 200, currency: 'EGP', netInCurrency: 200, categoryId: 'food', date: dinner.date });
    expect(group.kind === 'group' && group.rows.map((r) => r.id)).toEqual([dinner.id, ali.id, sara.id]);
  });

  it('keeps two groups apart', () => {
    const entries = foldGroups([tx(10, { groupId: 'a' }), tx(20, { groupId: 'b' }), tx(30, { groupId: 'a' }), tx(40, { groupId: 'b' })], CONV);
    expect(entries.map((e) => e.kind === 'group' && [e.groupId, e.net])).toEqual([['a', 40], ['b', 60]]);
  });

  it('shows a group with only one row in view as a plain transaction', () => {
    const other = tx(10);
    const only = back(200, { groupId: 'g' });
    expect(foldGroups([other, only], CONV)).toEqual([{ kind: 'tx', tx: other }, { kind: 'tx', tx: only }]);
  });

  it("takes the category of the largest purchase when the rows don't agree", () => {
    const [entry] = foldGroups([tx(100, { groupId: 'g', categoryId: 'fun' }), tx(300, { groupId: 'g', categoryId: 'food' })], CONV);
    expect(entry).toMatchObject({ kind: 'group', categoryId: 'food' });
  });

  it('gives the net in the main currency only when the currencies differ', () => {
    const [entry] = foldGroups([tx(600, { groupId: 'g' }), back(2, { groupId: 'g', currency: 'USD' })], CONV);
    expect(entry).toMatchObject({ kind: 'group', net: 500, currency: undefined, netInCurrency: undefined });
  });

  it('adds up a group of money received', () => {
    const [entry] = foldGroups([tx(100, { groupId: 'g', type: 'income', categoryId: 'salary' }), tx(50, { groupId: 'g', type: 'income', categoryId: 'salary' })], CONV);
    expect(entry).toMatchObject({ kind: 'group', flow: 'income', net: 150, categoryId: 'salary' });
  });

  it('treats a group of only money back as spending that came back', () => {
    const [entry] = foldGroups([back(200, { groupId: 'g' }), back(200, { groupId: 'g' })], CONV);
    expect(entry).toMatchObject({ kind: 'group', flow: 'expense', net: -400, netInCurrency: -400 });
  });

  it('gives a net below zero when more came back than the purchase in view', () => {
    const [entry] = foldGroups([tx(100, { groupId: 'g' }), back(300, { groupId: 'g' })], CONV);
    expect(entry).toMatchObject({ kind: 'group', flow: 'expense', net: -200 });
  });

  it('names the flows a group category must take: money back takes spending ones', () => {
    expect(groupFlows([back(1), back(2)])).toEqual(['expense']);
    expect(groupFlows([tx(1), back(2)])).toEqual(['expense']);
    expect(groupFlows([tx(1, { type: 'income' })])).toEqual(['income']);
  });

  it('returns nothing for nothing', () => {
    expect(foldGroups([], CONV)).toEqual([]);
  });
});
