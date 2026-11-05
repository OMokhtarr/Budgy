import '@/test/setup-db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BudgyDB, alive, nextCategoryOrder, reorderCategories, writeFromCloud } from './db';
import type { Category, Flow } from '@/shared/models';

const category = (id: string, order: number, kind: Category['kind'] = 'expense'): Category => ({
  id, name: id, kind, icon: 'other', color: '#111', order,
});

let database: BudgyDB;
let n = 0;
beforeEach(async () => {
  database = new BudgyDB(`category-order-${n++}`);
  await database.open();
});
afterEach(async () => {
  await database.delete();
});

/** The names one screen shows, in order. */
const screen = async (flow: Flow) =>
  (await database.categories.orderBy('order').filter(alive).toArray())
    .filter((c) => c.kind === flow || c.kind === 'both')
    .map((c) => c.id);

describe('reorderCategories', () => {
  const add = (...list: Category[]) => writeFromCloud(database, () => database.categories.bulkAdd(list));
  const dirty = async () => (await database.categories.where('dirty').equals(1).toArray()).map((c) => c.id).sort();

  it('saves the new order of a screen, even when categories shared numbers', async () => {
    // Expense and income categories number from 0 each, as the starting ones do.
    await add(category('food', 0), category('car', 1), category('home', 2), category('salary', 0, 'income'), category('gifts', 1, 'both'));
    await reorderCategories(['home', 'food', 'gifts', 'car'], database);
    expect(await screen('expense')).toEqual(['home', 'food', 'gifts', 'car']);
    expect(await screen('income')).toEqual(['salary', 'gifts']);
  });

  it('rewrites only the moved categories when each has its own number', async () => {
    await add(category('food', 0), category('car', 1), category('home', 2), category('salary', 3, 'income'), category('gifts', 4, 'both'));
    await reorderCategories(['home', 'food', 'car', 'gifts'], database);
    expect(await screen('expense')).toEqual(['home', 'food', 'car', 'gifts']);
    expect(await dirty()).toEqual(['car', 'food', 'home']);
  });

  it('ignores a category deleted meanwhile', async () => {
    await add(category('food', 0), category('car', 1));
    await reorderCategories(['car', 'gone', 'food'], database);
    expect(await screen('expense')).toEqual(['car', 'food']);
  });
});

describe('nextCategoryOrder', () => {
  it('comes after every category, whatever its kind', async () => {
    await database.categories.bulkAdd([category('food', 0), category('salary', 7, 'income')]);
    expect(await nextCategoryOrder(database)).toBe(8);
  });

  it('starts at 0 with no categories', async () => {
    expect(await nextCategoryOrder(database)).toBe(0);
  });
});
