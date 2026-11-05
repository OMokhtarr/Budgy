import '@/test/setup-db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BudgyDB, alive, reorderAccounts, writeFromCloud } from './db';
import type { Account } from '@/shared/models';

const account = (id: string, order: number, fields: Partial<Account> = {}): Account => ({
  id, name: id, type: 'bank', icon: 'card', color: '#111', currency: 'EGP', initialBalance: 0, order, createdAt: 'x', ...fields,
});

let database: BudgyDB;
let n = 0;
beforeEach(async () => {
  database = new BudgyDB(`account-order-${n++}`);
  await database.open();
});
afterEach(async () => {
  await database.delete();
});

const order = async () => (await database.accounts.orderBy('order').filter(alive).toArray()).map((a) => a.id);
const add = (...list: Account[]) => writeFromCloud(database, () => database.accounts.bulkAdd(list));
const dirty = async () => (await database.accounts.where('dirty').equals(1).toArray()).map((a) => a.id).sort();

describe('reorderAccounts', () => {
  it('saves the new order of the tiles, keeping Cash In and Cash Out where they are', async () => {
    await add(account('in', 0, { key: 'cashIn' }), account('out', 1, { key: 'cashOut' }), account('cib', 2), account('car', 3, { group: 'savings' }), account('vf', 4));
    await reorderAccounts(['vf', 'cib', 'car'], database);
    expect(await order()).toEqual(['in', 'out', 'vf', 'cib', 'car']);
    expect(await dirty()).toEqual(['car', 'cib', 'vf']);
  });

  it('renumbers every account when some shared a number', async () => {
    await add(account('a', 0), account('b', 0), account('c', 1));
    await reorderAccounts(['c', 'b', 'a'], database);
    expect(await order()).toEqual(['c', 'b', 'a']);
  });

  it('ignores an account deleted meanwhile', async () => {
    await add(account('a', 0), account('b', 1));
    await reorderAccounts(['b', 'gone', 'a'], database);
    expect(await order()).toEqual(['b', 'a']);
  });
});
