import '@/test/setup-db';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db/db';
import { deleteGroup, groupRows, moveToCategory, setGroupCategory, setGroupNote, ungroup } from './bulk';
import type { Category } from '@/shared/models';

const category = (id: string): Category => ({ id, name: id, kind: 'expense', icon: 'other', color: '#000', order: 0 });

async function addTx(subcategoryId: string) {
  const id = await db.transactions.add({
    type: 'expense', amount: 10, currency: 'EGP', accountId: 'cash', categoryId: 'food', subcategoryId, date: '2026-11-01T10:00:00.000Z', createdAt: 'x',
  });
  return (await db.transactions.get(id))!;
}

describe('moveToCategory', () => {
  it('clears the subcategory, which belonged to the old category', async () => {
    const x = await addTx('akl');
    await moveToCategory([x], category('family'));
    const moved = await db.transactions.get(x.id!);
    expect(moved?.categoryId).toBe('family');
    expect(moved?.subcategoryId).toBeUndefined();
  });

  it('keeps the subcategory when the category stays the same', async () => {
    const x = await addTx('akl');
    await moveToCategory([x], category('food'));
    expect((await db.transactions.get(x.id!))?.subcategoryId).toBe('akl');
  });
});

describe('moveToCategory with money back', () => {
  const income = (over: object = {}) =>
    db.transactions.add({ type: 'income', amount: 10, currency: 'EGP', accountId: 'cash', categoryId: 'food', date: '2026-11-01T10:00:00.000Z', createdAt: 'x', ...over })
      .then(async (id) => (await db.transactions.get(id))!);
  const of = (id: string, kind: Category['kind']): Category => ({ ...category(id), kind });

  it('moves money back to another expense category and keeps it money back', async () => {
    const x = await income({ moneyBack: true });
    expect(await moveToCategory([x], of('family', 'expense'))).toBe(0);
    const moved = await db.transactions.get(x.id!);
    expect(moved?.categoryId).toBe('family');
    expect(moved?.moneyBack).toBe(true);
  });

  it('skips money back for an income-only category', async () => {
    const x = await income({ moneyBack: true });
    expect(await moveToCategory([x], of('salary', 'income'))).toBe(1);
    expect((await db.transactions.get(x.id!))?.categoryId).toBe('food');
  });

  it('still skips plain income for an expense-only category', async () => {
    const x = await income();
    expect(await moveToCategory([x], of('family', 'expense'))).toBe(1);
  });
});

describe('groups', () => {
  beforeEach(() => db.transactions.clear());
  const add = async (over: object) => {
    const id = await db.transactions.add({ type: 'expense', amount: 10, currency: 'EGP', accountId: 'cash', categoryId: 'food', subcategoryId: 'akl', date: '2026-11-01T10:00:00.000Z', createdAt: 'x', ...over });
    return (await db.transactions.get(id))!;
  };
  const group = async () => [
    await add({ groupId: 'g' }),
    await add({ groupId: 'g', accountId: 'card' }),
    await add({ groupId: 'g', type: 'income', moneyBack: true }),
    await add({ groupId: 'other' }),
  ];

  it('changes the category of every row in the group, money back included', async () => {
    const [a, b, c, other] = await group();
    await setGroupCategory('g', 'family');
    for (const x of [a, b, c]) {
      const row = await db.transactions.get(x.id!);
      expect(row?.categoryId).toBe('family');
      expect(row?.subcategoryId).toBeUndefined();
    }
    expect((await db.transactions.get(other.id!))?.categoryId).toBe('food');
  });

  it('takes one row out of its group, and money back stays money back', async () => {
    const [a, , c] = await group();
    await ungroup(c);
    const row = await db.transactions.get(c.id!);
    expect(row?.groupId).toBeUndefined();
    expect(row?.moneyBack).toBe(true);
    expect((await db.transactions.get(a.id!))?.groupId).toBe('g');
  });

  it('gives every row of a group the note, trimmed, and drops an empty one', async () => {
    const [a, , c, other] = await group();
    await setGroupNote('g', '  Dinner  ');
    expect((await db.transactions.get(a.id!))?.note).toBe('Dinner');
    expect((await db.transactions.get(c.id!))?.note).toBe('Dinner');
    expect((await db.transactions.get(other.id!))?.note).toBeUndefined();
    await setGroupNote('g', '   ');
    expect((await db.transactions.get(a.id!))?.note).toBeUndefined();
  });

  it('deletes every row of a group', async () => {
    const [a, b, c, other] = await group();
    await deleteGroup('g');
    for (const x of [a, b, c]) expect((await db.transactions.get(x.id!))?.deletedAt).toBeTruthy();
    expect((await db.transactions.get(other.id!))?.deletedAt).toBeUndefined();
  });

  it('lists the live rows of a group, in any period', async () => {
    const [a, b, c] = await group();
    const later = await add({ groupId: 'g', date: '2027-01-01T10:00:00.000Z' });
    await db.transactions.update(b.id!, { deletedAt: '2026-11-02T00:00:00.000Z' });
    expect((await groupRows('g')).map((x) => x.id).sort()).toEqual([a.id, c.id, later.id].sort());
  });
});
