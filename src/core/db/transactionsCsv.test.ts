import '@/test/setup-db';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Account, Category, Transaction } from '@/shared/models';
import { toCsv } from '@/core/utils/files';
import { dayKey } from '@/core/utils/period';
import { alive, db, writeFromCloud } from './db';
import { CSV_HEADER, csvRows, parseCsv, planCsvImport, saveCsvImport, type CsvData } from './transactionsCsv';

const account = (over: Partial<Account> & { id: string }): Account => ({
  name: '', type: 'cash', icon: 'wallet', color: '#000000', currency: 'EGP', initialBalance: 0, order: 0, createdAt: '2026-01-01T00:00:00.000Z', ...over,
});
const category = (over: Partial<Category> & { id: string }): Category => ({
  name: '', kind: 'expense', icon: 'cart', color: '#000000', order: 0, ...over,
});

const CASH = account({ id: 'cash', name: 'Cash' });
const USD = account({ id: 'usd', name: 'Dollars', currency: 'USD', order: 1 });
const FOOD = category({ id: 'food', name: 'Food' });
const SALARY = category({ id: 'salary', name: 'Salary', kind: 'income', order: 1 });
const DATA: CsvData = { accounts: [CASH, USD], categories: [FOOD, SALARY], transactions: [] };

/** A file with the export's header. Each row lists values by column name; anything left out is empty. */
const file = (...rows: Partial<Record<(typeof CSV_HEADER)[number], string>>[]) =>
  toCsv([[...CSV_HEADER], ...rows.map((r) => CSV_HEADER.map((c) => r[c] ?? ''))]);
const lunch = { Date: '2026-03-15', Type: 'expense', Amount: '120.5', Currency: 'EGP', Account: 'Cash', Category: 'Food', Note: 'Lunch' };

/** Translations for the built-in records, in the two languages the app ships. */
const labels = (key: string) => (({ 'accounts.starter.cashIn': ['Cash In', 'كاش إن'], 'cat.car': ['Car', 'سيارة'] }) as Record<string, string[]>)[key] ?? [];

const plan = (text: string, data: CsvData = DATA) => {
  const result = planCsvImport(text, data, labels);
  if (!result) throw new Error('file was not recognised');
  return result;
};

describe('parseCsv', () => {
  it('reads quoted commas, doubled quotes and line breaks inside a field', () => {
    expect(parseCsv('a,"b,c","say ""hi""","two\nlines"')).toEqual([['a', 'b,c', 'say "hi"', 'two\nlines']]);
  });

  it('ignores the byte order mark, Windows line endings and a final blank line', () => {
    expect(parseCsv('﻿a,b\r\nc,d\r\n')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('keeps empty fields', () => {
    expect(parseCsv('a,,\n,,b')).toEqual([['a', '', ''], ['', '', 'b']]);
  });
});

describe('planCsvImport: recognising a file', () => {
  it('returns null for a file without the required columns', () => {
    expect(planCsvImport('DATE,TYPE,FROM ACCOUNT\n01/01/2026,Expense,Cash', DATA, labels)).toBeNull();
  });

  it('accepts columns in any order and any letter case, and a file without the rate columns', () => {
    const text = 'note,AMOUNT,type,Account,currency,date,category\nLunch,50,expense,Cash,EGP,2026-03-15,Food';
    expect(plan(text).transactions).toMatchObject([{ amount: 50, categoryId: 'food', note: 'Lunch' }]);
  });
});

describe('planCsvImport: rows', () => {
  it('turns an expense into a transaction on the same local day', () => {
    const [t] = plan(file(lunch)).transactions;
    expect(t).toMatchObject({ type: 'expense', amount: 120.5, currency: 'EGP', accountId: 'cash', categoryId: 'food', note: 'Lunch' });
    expect(dayKey(new Date(t.date))).toBe('2026-03-15');
  });

  it('keeps the order of rows within a day', () => {
    const { transactions: [a, b] } = plan(file({ ...lunch, Note: 'first' }, { ...lunch, Note: 'second' }));
    expect(Date.parse(b.date)).toBeGreaterThan(Date.parse(a.date));
  });

  it('keeps what arrived on a transfer between currencies', () => {
    const [t] = plan(file({ Date: '2026-03-15', Type: 'transfer', Amount: '200', Currency: 'USD', Account: 'Dollars', 'To account': 'Cash', Received: '11000', 'Received currency': 'EGP' })).transactions;
    expect(t).toMatchObject({ type: 'transfer', accountId: 'usd', toAccountId: 'cash', toAmount: 11000, toCurrency: 'EGP' });
    expect(t.categoryId).toBeUndefined();
  });

  it('keeps the rate of a foreign-currency expense', () => {
    const [t] = plan(file({ ...lunch, Account: 'Dollars', Currency: 'USD', Rate: '52.5', 'Rate currency': 'EGP' })).transactions;
    expect(t).toMatchObject({ rate: 52.5, rateCurrency: 'EGP' });
  });

  it('leaves the rate unset when the file has none', () => {
    const [t] = plan(file({ ...lunch, Account: 'Dollars', Currency: 'USD' })).transactions;
    expect(t.rate).toBeUndefined();
    expect(t.rateCurrency).toBeUndefined();
  });

  it('accepts an expense without a category', () => {
    const [t] = plan(file({ ...lunch, Category: '' })).transactions;
    expect(t.categoryId).toBeUndefined();
  });
});

describe('planCsvImport: matching names', () => {
  it('ignores letter case and surrounding spaces', () => {
    expect(plan(file({ ...lunch, Account: ' cash ', Category: 'FOOD' })).transactions[0]).toMatchObject({ accountId: 'cash', categoryId: 'food' });
  });

  it('finds a built-in account by its name in either language', () => {
    const data = { ...DATA, accounts: [account({ id: 'in', key: 'cashIn' })] };
    for (const name of ['Cash In', 'كاش إن']) {
      const result = plan(file({ ...lunch, Account: name, Category: '' }), data);
      expect(result.transactions[0].accountId).toBe('in');
      expect(result.newAccounts).toEqual([]);
    }
  });

  it('finds a built-in category by its name in either language', () => {
    const data = { ...DATA, categories: [category({ id: 'car', key: 'car' })] };
    for (const name of ['Car', 'سيارة']) {
      expect(plan(file({ ...lunch, Category: name }), data).transactions[0].categoryId).toBe('car');
    }
  });

  it('does not match a deleted account', () => {
    const data = { ...DATA, accounts: [{ ...CASH, deletedAt: '2026-01-01T00:00:00.000Z' }] };
    const result = plan(file(lunch), data);
    expect(result.newAccounts).toHaveLength(1);
    expect(result.transactions[0].accountId).toBe(result.newAccounts[0].id);
  });
});

describe('planCsvImport: creating what is missing', () => {
  it('creates a missing account once, in the currency of its rows', () => {
    const result = plan(file({ ...lunch, Account: 'Wallet' }, { ...lunch, Account: 'wallet', Note: 'Dinner' }));
    expect(result.newAccounts).toMatchObject([{ name: 'Wallet', currency: 'EGP', initialBalance: 0, order: 2 }]);
    expect(result.transactions.map((t) => t.accountId)).toEqual([result.newAccounts[0].id, result.newAccounts[0].id]);
  });

  it('gives a new account a second currency when its rows use two', () => {
    const result = plan(file({ ...lunch, Account: 'Wallet' }, { ...lunch, Account: 'Wallet', Currency: 'USD' }));
    expect(result.newAccounts).toMatchObject([{ currency: 'EGP', currency2: 'USD' }]);
    expect(result.badRows).toEqual([]);
  });

  it('creates a missing category for the flow of its row', () => {
    const result = plan(file({ ...lunch, Category: 'Pets' }));
    expect(result.newCategories).toMatchObject([{ name: 'Pets', kind: 'expense', order: 2 }]);
    expect(result.transactions[0].categoryId).toBe(result.newCategories[0].id);
  });

  it('makes a new category fit both flows when the file uses it for both', () => {
    const result = plan(file({ ...lunch, Category: 'Moves' }, { ...lunch, Type: 'income', Category: 'Moves' }));
    expect(result.newCategories).toMatchObject([{ name: 'Moves', kind: 'both' }]);
  });

  it('leaves an existing category alone when a row needs it for the other flow', () => {
    const result = plan(file({ ...lunch, Type: 'income' }));
    expect(result.newCategories).toMatchObject([{ name: 'Food', kind: 'income' }]);
    expect(result.transactions[0].categoryId).not.toBe('food');
    expect(result.changedCategories).toEqual([]);
  });

  it('adds a missing subcategory to an existing category, keeping the ones it has', () => {
    const data = { ...DATA, categories: [{ ...FOOD, subcategories: [{ id: 'old', name: 'Snacks', icon: 'cart' }] }] };
    const result = plan(file({ ...lunch, Subcategory: 'Groceries' }), data);
    const [changed] = result.changedCategories;
    expect(changed.subcategories?.map((s) => s.name)).toEqual(['Snacks', 'Groceries']);
    expect(result.transactions[0].subcategoryId).toBe(changed.subcategories?.[1].id);
  });

  it('reuses an existing subcategory without changing the category', () => {
    const data = { ...DATA, categories: [{ ...FOOD, subcategories: [{ id: 'old', name: 'Snacks', icon: 'cart' }] }] };
    const result = plan(file({ ...lunch, Subcategory: 'snacks' }), data);
    expect(result.transactions[0].subcategoryId).toBe('old');
    expect(result.changedCategories).toEqual([]);
  });

  it('creates nothing for a row that turns out to be unreadable', () => {
    const result = plan(file({ ...lunch, Account: 'Wallet', Category: 'Pets', Amount: 'lots' }));
    expect(result.newAccounts).toEqual([]);
    expect(result.newCategories).toEqual([]);
  });

  it('creates nothing for a transfer whose other side is unreadable', () => {
    const result = plan(file({ Date: '2026-03-15', Type: 'transfer', Amount: '5', Currency: 'EUR', Account: 'New', 'To account': 'Cash' }));
    expect(result.badRows).toEqual([2]);
    expect(result.newAccounts).toEqual([]);
  });
});

describe('planCsvImport: rows it cannot read', () => {
  const transfer = { Date: '2026-03-15', Type: 'transfer', Amount: '5', Currency: 'EGP', Account: 'Cash' };
  it.each([
    ['a date in another format', { ...lunch, Date: '15/03/2026' }],
    ['a date that does not exist', { ...lunch, Date: '2026-02-31' }],
    ['a blank amount', { ...lunch, Amount: '' }],
    ['a negative amount', { ...lunch, Amount: '-5' }],
    ['an amount with a thousands comma', { ...lunch, Amount: '1,200' }],
    ['an unknown type', { ...lunch, Type: 'refund' }],
    ['a blank account', { ...lunch, Account: '' }],
    ['an invalid currency', { ...lunch, Currency: 'dollars' }],
    ['a currency its existing account does not hold', { ...lunch, Currency: 'USD' }],
    ['a subcategory with no category', { ...lunch, Category: '', Subcategory: 'Snacks' }],
    ['a rate without its currency', { ...lunch, Rate: '50' }],
    ['a transfer with no destination', transfer],
    ['a transfer to the same account', { ...transfer, 'To account': 'cash' }],
    ['a received amount without its currency', { ...transfer, 'To account': 'Dollars', Received: '5' }],
    ['a transfer arriving in a currency the destination does not hold', { ...transfer, 'To account': 'Dollars' }],
  ])('reports %s by its row number and still plans the rest', (_name, row) => {
    const result = plan(file(lunch, row, { ...lunch, Note: 'Dinner' }));
    expect(result.badRows).toEqual([3]);
    expect(result.transactions.map((t) => t.note)).toEqual(['Lunch', 'Dinner']);
  });
});

describe('planCsvImport: limits', () => {
  it('refuses a third currency on a new account, which can only hold two', () => {
    const wallet = { ...lunch, Account: 'Wallet' };
    const result = plan(file(wallet, { ...wallet, Currency: 'USD' }, { ...wallet, Currency: 'SAR' }));
    expect(result.badRows).toEqual([4]);
    expect(result.newAccounts).toMatchObject([{ currency: 'EGP', currency2: 'USD' }]);
  });

  it('refuses a transfer between two names of the same built-in account', () => {
    const data = { ...DATA, accounts: [account({ id: 'in', key: 'cashIn' })] };
    const row = { Date: '2026-03-15', Type: 'transfer', Amount: '5', Currency: 'EGP', Account: 'Cash In', 'To account': 'كاش إن' };
    expect(plan(file(row), data).badRows).toEqual([2]);
  });

  it('passes over a blank row without calling it unreadable', () => {
    const result = plan(`${file(lunch)}\r\n,,,,,,,,,,,,\r\n`);
    expect(result.badRows).toEqual([]);
    expect(result.transactions).toHaveLength(1);
  });
});

describe('planCsvImport: rows already in Budgy', () => {
  const existing: Transaction = {
    id: 'x', type: 'expense', amount: 120.5, currency: 'EGP', accountId: 'cash', categoryId: 'food', note: 'Lunch',
    date: new Date(2026, 2, 15, 18).toISOString(), createdAt: '2026-03-15T00:00:00.000Z',
  };
  const withExisting = { ...DATA, transactions: [existing] };

  it('skips a row that matches a saved transaction on the same day', () => {
    const result = plan(file(lunch), withExisting);
    expect(result.transactions).toEqual([]);
    expect(result.duplicates).toBe(1);
  });

  it('adds repeats beyond the number already saved, so two real purchases stay two', () => {
    const result = plan(file(lunch, lunch, lunch), withExisting);
    expect(result.transactions).toHaveLength(2);
    expect(result.duplicates).toBe(1);
  });

  it('keeps identical rows in a file when nothing matches yet', () => {
    expect(plan(file(lunch, lunch)).transactions).toHaveLength(2);
  });

  it.each([
    ['day', { Date: '2026-03-16' }],
    ['amount', { Amount: '99' }],
    ['note', { Note: 'Dinner' }],
    ['category', { Category: '' }],
  ])('treats a row with a different %s as new', (_name, change) => {
    expect(plan(file({ ...lunch, ...change }), withExisting).duplicates).toBe(0);
  });

  it('does not count a deleted transaction as already there', () => {
    const data = { ...DATA, transactions: [{ ...existing, deletedAt: '2026-04-01T00:00:00.000Z' }] };
    expect(plan(file(lunch), data).transactions).toHaveLength(1);
  });
});

describe('csvRows', () => {
  const names = {
    accountName: (a?: Account) => a?.name ?? 'Deleted',
    categoryName: (c?: Category) => c?.name ?? 'Uncategorized',
  };

  it('writes the rate columns for a foreign-currency expense', () => {
    const tx: Transaction = { type: 'expense', amount: 5, currency: 'USD', accountId: 'usd', categoryId: 'food', rate: 52.5, rateCurrency: 'EGP', date: new Date(2026, 2, 15, 12).toISOString(), createdAt: '' };
    const [head, row] = csvRows([tx], [USD], [FOOD], names);
    expect(row[head.indexOf('Rate')]).toBe(52.5);
    expect(row[head.indexOf('Rate currency')]).toBe('EGP');
  });

  it('round trips: importing an export finds nothing new', () => {
    const food = { ...FOOD, subcategories: [{ id: 'sub', name: 'Snacks', icon: 'cart' }] };
    const at = new Date(2026, 2, 15, 12).toISOString();
    const base = { date: at, createdAt: at };
    const txs: Transaction[] = [
      { ...base, id: '1', type: 'expense', amount: 10.5, currency: 'EGP', accountId: 'cash', categoryId: 'food', subcategoryId: 'sub', note: 'has, comma and "quotes"\nand a new line' },
      { ...base, id: '2', type: 'income', amount: 800, currency: 'USD', accountId: 'usd', categoryId: 'salary', rate: 52.5, rateCurrency: 'EGP' },
      { ...base, id: '3', type: 'transfer', amount: 200, currency: 'USD', accountId: 'usd', toAccountId: 'cash', toAmount: 11000, toCurrency: 'EGP' },
    ];
    const data = { accounts: [CASH, USD], categories: [food, SALARY], transactions: txs };
    const result = plan(toCsv(csvRows(data.transactions, data.accounts, data.categories, names)), data);
    expect(result).toMatchObject({ transactions: [], duplicates: 3, badRows: [], newAccounts: [], newCategories: [], changedCategories: [] });
  });
});

describe('saveCsvImport', () => {
  beforeEach(async () => {
    await Promise.all([db.accounts.clear(), db.categories.clear(), db.transactions.clear()]);
    // Written as if downloaded by sync, so nothing starts out marked for upload.
    await writeFromCloud(db, async () => {
      await db.accounts.bulkAdd([CASH, USD]);
      await db.categories.bulkAdd([FOOD, SALARY]);
      await db.transactions.add({ id: 'kept', type: 'income', amount: 1000, currency: 'EGP', accountId: 'cash', categoryId: 'salary', date: new Date(2026, 0, 1, 12).toISOString(), createdAt: 'x' });
    });
  });

  const current = async (): Promise<CsvData> => ({
    accounts: await db.accounts.toArray(),
    categories: await db.categories.toArray(),
    transactions: await db.transactions.toArray(),
  });

  it('adds to the data without touching what was there', async () => {
    await saveCsvImport(plan(file(lunch), await current()));
    const all = await db.transactions.filter(alive).toArray();
    expect(all.map((t) => t.amount).sort((a, b) => a - b)).toEqual([120.5, 1000]);
    expect((await db.transactions.get('kept'))?.dirty).toBeUndefined();
  });

  it('saves new accounts and categories, linked from their transactions and marked for upload', async () => {
    await saveCsvImport(plan(file({ ...lunch, Account: 'Wallet', Category: 'Pets', Subcategory: 'Vet' }), await current()));
    const wallet = (await db.accounts.toArray()).find((a) => a.name === 'Wallet')!;
    const pets = (await db.categories.toArray()).find((c) => c.name === 'Pets')!;
    const tx = (await db.transactions.toArray()).find((t) => t.note === 'Lunch')!;
    expect(tx).toMatchObject({ accountId: wallet.id, categoryId: pets.id, subcategoryId: pets.subcategories?.[0].id, dirty: 1 });
    expect(wallet.dirty).toBe(1);
    expect(pets.dirty).toBe(1);
  });

  it('saves a subcategory added to an existing category and marks it for upload', async () => {
    await saveCsvImport(plan(file({ ...lunch, Subcategory: 'Groceries' }), await current()));
    const food = await db.categories.get('food');
    expect(food?.subcategories?.map((s) => s.name)).toEqual(['Groceries']);
    expect(food?.dirty).toBe(1);
  });

  it('finds nothing new when the same file is imported again', async () => {
    const text = file(lunch, { ...lunch, Account: 'Wallet', Category: 'Pets', Subcategory: 'Vet' });
    await saveCsvImport(plan(text, await current()));
    expect(plan(text, await current())).toMatchObject({ transactions: [], duplicates: 2, newAccounts: [], newCategories: [], changedCategories: [] });
  });
});
