import '@/test/setup-db';
import { beforeEach, describe, expect, it } from 'vitest';
import { alive, BudgyDB } from '@/core/db/db';
import { addDueAuto, addOccurrence, makeRecurring, saveRecurring, skipOccurrence } from './actions';
import type { Recurring, Transaction } from '@/shared/models';

const database = new BudgyDB('t-recurring');
const noRate = () => ({});

const rent: Transaction = {
  id: 'tx-rent',
  type: 'expense',
  amount: 5000,
  currency: 'EGP',
  accountId: 'bank',
  categoryId: 'home',
  note: 'Rent',
  date: new Date(2026, 9, 1, 9, 30).toISOString(),
  createdAt: '2026-10-01T07:30:00.000Z',
  smsFingerprint: 'fp',
};

const rule = async (over: Partial<Recurring> = {}): Promise<Recurring> => {
  const r: Recurring = {
    tx: { type: 'expense', amount: 100, currency: 'EGP', accountId: 'bank', categoryId: 'home' },
    unit: 'month',
    every: 1,
    start: '2026-09-01',
    next: '2026-10-01',
    createdAt: 'x',
    ...over,
  };
  r.id = await database.recurring.add(r);
  return r;
};

const txs = () => database.transactions.filter(alive).toArray();

describe('recurring transactions', () => {
  beforeEach(async () => {
    await database.recurring.clear();
    await database.transactions.clear();
  });

  it('turns a saved transaction into a recurring one, starting on its day', async () => {
    await database.transactions.add(rent);
    const id = await makeRecurring(rent, { unit: 'month', every: 1 }, false, database);
    const r = await database.recurring.get(id);
    expect(r).toMatchObject({ unit: 'month', every: 1, start: '2026-10-01', next: '2026-11-01' });
    expect(r!.auto).toBeUndefined();
    // What each occurrence adds, without the bank text or the stamps.
    expect(r!.tx).toEqual({ type: 'expense', amount: 5000, currency: 'EGP', accountId: 'bank', categoryId: 'home', note: 'Rent' });
    expect((await database.transactions.get('tx-rent'))!.recurringId).toBe(id);
  });

  it('adds a due occurrence once and moves next past it', async () => {
    const r = await rule();
    const first = await addOccurrence(r, '2026-10-01', { ...r.tx, amount: 120 }, noRate, database);
    await addOccurrence(r, '2026-10-01', { ...r.tx, amount: 120 }, noRate, database);
    const all = await txs();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: first.id, amount: 120, recurringId: r.id });
    expect(new Date(all[0].date).getDate()).toBe(1);
    expect((await database.recurring.get(r.id!))!.next).toBe('2026-11-01');
  });

  it('two phones adding the same day write the same transaction', async () => {
    const r = await rule();
    const phone2 = new BudgyDB('t-recurring-2');
    await phone2.recurring.put(r);
    const a = await addOccurrence(r, '2026-10-01', r.tx, noRate, database);
    const b = await addOccurrence(r, '2026-10-01', r.tx, noRate, phone2);
    expect(a.id).toBe(b.id);
    phone2.close();
  });

  it('skips one without adding anything', async () => {
    const r = await rule();
    await skipOccurrence(r, '2026-10-01', database);
    expect(await txs()).toHaveLength(0);
    expect((await database.recurring.get(r.id!))!.next).toBe('2026-11-01');
  });

  it('adding an older one keeps next where it is', async () => {
    const r = await rule({ next: '2026-11-01' });
    await addOccurrence(r, '2026-10-01', r.tx, noRate, database);
    expect((await database.recurring.get(r.id!))!.next).toBe('2026-11-01');
  });

  it('adds every due day of the automatic ones only, with the saved rate', async () => {
    const auto = await rule({ auto: true, tx: { type: 'expense', amount: 10, currency: 'USD', accountId: 'bank', categoryId: 'home' } });
    await rule({ next: '2026-10-01' }); // asks first
    const rateFor = (c: string) => (c === 'USD' ? { rate: 50, rateCurrency: 'EGP' } : {});
    const added = await addDueAuto(new Date(2026, 11, 15), rateFor, database);
    expect(added).toBe(3); // Oct, Nov, Dec
    const all = await txs();
    expect(all.every((t) => t.recurringId === auto.id && t.rate === 50 && t.rateCurrency === 'EGP')).toBe(true);
    expect((await database.recurring.get(auto.id!))!.next).toBe('2027-01-01');
    expect(await addDueAuto(new Date(2026, 11, 15), rateFor, database)).toBe(0);
  });

  it('saves a new one starting on the picked day, and an edit moves next only when the day changes', async () => {
    const id = await saveRecurring(undefined, { tx: rent, unit: 'week', every: 2, day: '2026-11-20', auto: true }, database);
    expect(await database.recurring.get(id)).toMatchObject({ start: '2026-11-20', next: '2026-11-20', auto: true, unit: 'week', every: 2 });

    const r = (await database.recurring.get(id))!;
    await database.recurring.update(id, { next: '2026-12-04' });
    await saveRecurring({ ...r, next: '2026-12-04' }, { tx: { ...rent, amount: 6000 }, unit: 'week', every: 2, day: '2026-12-04', auto: false }, database);
    expect(await database.recurring.get(id)).toMatchObject({ start: '2026-11-20', next: '2026-12-04', tx: { amount: 6000 } });
    expect((await database.recurring.get(id))!.auto).toBeUndefined();

    await saveRecurring({ ...r, next: '2026-12-04' }, { tx: rent, unit: 'month', every: 1, day: '2026-12-10', auto: false }, database);
    expect(await database.recurring.get(id)).toMatchObject({ start: '2026-12-10', next: '2026-12-10', unit: 'month' });
  });
});
