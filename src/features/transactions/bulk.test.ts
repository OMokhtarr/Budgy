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
