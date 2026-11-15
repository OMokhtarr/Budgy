import '@/test/setup-db';
import { describe, expect, it } from 'vitest';
import { db } from '@/core/db/db';
import { moveToCategory } from './bulk';
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
