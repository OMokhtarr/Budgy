import type { Account, Category, Flow, Subcategory, Transaction, TxType } from '@/shared/models';
import { COLORS } from '@/shared/icons';
import { newId } from '@/core/utils/id';
import { dayKey } from '@/core/utils/period';
import { subcategoryName } from '@/core/utils/subcategories';
import { alive, db, softDelete } from './db';

/** The columns of an exported file. An import needs only `REQUIRED`, and takes them in any order. */
export const CSV_HEADER = [
  'Date', 'Type', 'Amount', 'Currency', 'Account', 'To account', 'Category', 'Subcategory', 'Note',
  'Received', 'Received currency', 'Rate', 'Rate currency',
] as const;
const REQUIRED = ['date', 'type', 'amount', 'currency', 'account'];

interface Names {
  accountName: (a?: Account) => string;
  categoryName: (c?: Category) => string;
}

/** The rows of an exported file, header first. */
export function csvRows(txs: Transaction[], accounts: Account[], categories: Category[], { accountName, categoryName }: Names): (string | number)[][] {
  const accountOf = new Map(accounts.map((a) => [a.id, a]));
  const categoryOf = new Map(categories.map((c) => [c.id, c]));
  return [
    [...CSV_HEADER],
    ...txs.map((x) => [
      // Local day, as shown in the app; the stored ISO string is UTC.
      dayKey(new Date(x.date)),
      x.type,
      x.amount,
      x.currency,
      accountName(accountOf.get(x.accountId)),
      x.toAccountId != null ? accountName(accountOf.get(x.toAccountId)) : '',
      x.categoryId != null ? categoryName(categoryOf.get(x.categoryId)) : '',
      subcategoryName(categoryOf.get(x.categoryId), x.subcategoryId),
      x.note ?? '',
      x.toAmount ?? '',
      x.toCurrency ?? '',
      x.rate ?? '',
      x.rateCurrency ?? '',
    ]),
  ];
}

/** Reads CSV text: quoted fields may hold commas, doubled quotes and line breaks. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  const chars = text.replace(/^﻿/, '');
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (chars[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ',') endField();
    else if (c === '\n') endRow();
    else if (c !== '\r') field += c;
  }
  if (field || row.length) endRow();
  return rows;
}

export interface CsvData {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
}

/** What importing a file would do. Nothing is saved until it's passed to `saveCsvImport`. */
export interface CsvPlan {
  transactions: Transaction[];
  newAccounts: Account[];
  newCategories: Category[];
  /** Existing categories that gain a subcategory. */
  changedCategories: Category[];
  /**
   * Existing categories no transaction would use after the import, which it can delete (see `unusedAfter`).
   * Only for the flows the file gives categories to, so a file of expenses leaves income categories alone.
   */
  unusedCategories: Category[];
  /** Subcategories no transaction would use, in the kept categories the file gives subcategories to. */
  unusedSubcategories: { categoryId: string; ids: string[] }[];
  /** Rows already in Budgy, which are skipped. */
  duplicates: number;
  /** Rows that can't be read, numbered as in a spreadsheet: the header is row 1. */
  badRows: number[];
}

interface Row {
  day: string;
  date: [year: number, month: number, day: number];
  type: TxType;
  amount: number;
  currency: string;
  account: string;
  toAccount: string;
  category: string;
  subcategory: string;
  note: string;
  toAmount?: number;
  toCurrency?: string;
  rate?: number;
  rateCurrency?: string;
}

const norm = (s: string) => s.trim().toLocaleLowerCase();
const isCurrency = (s: string) => /^[A-Z]{3}$/.test(s);
const toNumber = (s: string) => (/^\d+(\.\d+)?$/.test(s) ? Number(s) : undefined);

function readDate(s: string): Row['date'] | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return date.getMonth() === mo - 1 && date.getDate() === d ? [y, mo, d] : undefined;
}

/** The row's values if each one makes sense by itself, otherwise undefined. */
function readRow(get: (column: string) => string): Row | undefined {
  const date = readDate(get('date'));
  const type = get('type').toLowerCase();
  const amount = toNumber(get('amount'));
  const currency = get('currency').toUpperCase();
  const account = get('account');
  if (!date || (type !== 'expense' && type !== 'income' && type !== 'transfer') || amount == null || !isCurrency(currency) || !account) return undefined;
  const row: Row = {
    day: get('date'), date, type, amount, currency, account, note: get('note'),
    toAccount: '', category: '', subcategory: '',
  };
  if (type === 'transfer') {
    row.toAccount = get('to account');
    if (!row.toAccount) return undefined;
    const received = get('received');
    const receivedCurrency = get('received currency').toUpperCase();
    if (received || receivedCurrency) {
      row.toAmount = toNumber(received);
      row.toCurrency = receivedCurrency;
      if (row.toAmount == null || !isCurrency(receivedCurrency)) return undefined;
    }
    return row;
  }
  row.category = get('category');
  row.subcategory = get('subcategory');
  if (row.subcategory && !row.category) return undefined;
  const rate = get('rate');
  const rateCurrency = get('rate currency').toUpperCase();
  if (rate || rateCurrency) {
    row.rate = toNumber(rate);
    row.rateCurrency = rateCurrency;
    // The two only mean something together (see `txInBase`).
    if (!row.rate || !isCurrency(rateCurrency)) return undefined;
  }
  return row;
}

const holds = (a: Account, currency: string) => a.currency === currency || a.currency2 === currency;

/** Identifies a transaction by what shows in a file, for spotting ones already saved. */
function fingerprint(t: Pick<Transaction, 'type' | 'amount' | 'currency' | 'accountId' | 'toAccountId' | 'categoryId' | 'subcategoryId' | 'note' | 'toAmount' | 'toCurrency'>, day: string): string {
  return [day, t.type, t.amount, t.currency, t.accountId, t.toAccountId, t.categoryId, t.subcategoryId, t.note?.trim(), t.toAmount, t.toCurrency].map((v) => v ?? '').join('\u0000');
}

/**
 * Works out what importing a file would do, or returns null if it doesn't have the needed columns.
 * Accounts, categories and subcategories that don't exist yet are created; existing accounts and category
 * kinds are never changed. Saved transactions are matched one for one, so importing a file twice adds
 * nothing while two identical purchases in a file stay two.
 *
 * `labelsOf` gives a translation key's text in every language, since built-in records can be written either way.
 */
export function planCsvImport(text: string, data: CsvData, labelsOf: (key: string) => string[]): CsvPlan | null {
  const [head, ...rows] = parseCsv(text);
  const columns = (head ?? []).map(norm);
  if (!REQUIRED.every((c) => columns.includes(c))) return null;

  const accounts = data.accounts.filter(alive);
  const categories = data.categories.filter(alive).map((c) => ({ ...c }));
  const accountLabels = (a: Account) => (a.name ? [a.name] : labelsOf(a.key ? `accounts.starter.${a.key}` : `accountType.${a.type}`));
  const categoryLabels = (c: Category) => (c.name ? [c.name] : c.key ? labelsOf(`cat.${c.key}`) : []);
  const fits = (c: Category, flow: Flow) => c.kind === 'both' || c.kind === flow;
  const named = (c: Category, name: string) => categoryLabels(c).some((l) => norm(l) === norm(name));
  const findAccount = (name: string) => accounts.find((a) => accountLabels(a).some((l) => norm(l) === norm(name)));
  const findCategory = (name: string, flow: Flow) => categories.find((c) => fits(c, flow) && named(c, name));
  const findSubcategory = (c: Category | undefined, name: string) => c?.subcategories?.find((s) => norm(s.name) === norm(name));

  const plan: CsvPlan = {
    transactions: [], newAccounts: [], newCategories: [], changedCategories: [], unusedCategories: [], unusedSubcategories: [], duplicates: 0, badRows: [],
  };
  const nextOrder = (list: { order: number }[]) => Math.max(-1, ...list.map((x) => x.order)) + 1;
  const stamp = new Date().toISOString();

  /** True if the account can take this currency: it holds it, it doesn't exist yet, or it's new with room for a second. */
  const canHold = (name: string, currency: string) => {
    const a = findAccount(name);
    return !a || holds(a, currency) || (plan.newAccounts.includes(a) && !a.currency2);
  };
  const sameAccount = (a: string, b: string) => {
    const found = findAccount(a);
    return norm(a) === norm(b) || (!!found && found === findAccount(b));
  };
  const fitsAccounts = (r: Row) =>
    canHold(r.account, r.currency)
    && (r.type !== 'transfer' || (canHold(r.toAccount, r.toCurrency ?? r.currency) && !sameAccount(r.account, r.toAccount)));
  const accountFor = (name: string, currency: string): Account => {
    let a = findAccount(name);
    if (!a) {
      const order = nextOrder(accounts);
      a = { id: newId(), name, type: 'cash', icon: 'wallet', color: COLORS[order % COLORS.length], currency, initialBalance: 0, order, createdAt: stamp };
      accounts.push(a);
      plan.newAccounts.push(a);
    } else if (!holds(a, currency)) a.currency2 = currency;
    return a;
  };
  const categoryFor = (name: string, flow: Flow): Category => {
    const found = findCategory(name, flow);
    if (found) return found;
    // New in this file and used for the other flow: one category can take both.
    const other = plan.newCategories.find((c) => named(c, name));
    if (other) {
      other.kind = 'both';
      return other;
    }
    const order = nextOrder(categories);
    const c: Category = { id: newId(), name, kind: flow, icon: 'other', color: COLORS[order % COLORS.length], order };
    categories.push(c);
    plan.newCategories.push(c);
    return c;
  };
  const subcategoryFor = (c: Category, name: string): Subcategory => {
    const found = findSubcategory(c, name);
    if (found) return found;
    const s: Subcategory = { id: newId(), name, icon: 'other' };
    c.subcategories = [...(c.subcategories ?? []), s];
    if (!plan.newCategories.includes(c) && !plan.changedCategories.includes(c)) plan.changedCategories.push(c);
    return s;
  };

  const saved = new Map<string, number>();
  for (const t of data.transactions.filter(alive)) {
    const key = fingerprint(t, dayKey(new Date(t.date)));
    saved.set(key, (saved.get(key) ?? 0) + 1);
  }
  /** Spends a saved match for this row, if everything it names already exists and one is left. */
  const alreadySaved = (r: Row): boolean => {
    const account = findAccount(r.account);
    const toAccount = r.toAccount ? findAccount(r.toAccount) : undefined;
    const category = r.category && r.type !== 'transfer' ? findCategory(r.category, r.type) : undefined;
    const subcategory = r.subcategory ? findSubcategory(category, r.subcategory) : undefined;
    if (!account || (r.toAccount && !toAccount) || (r.category && !category) || (r.subcategory && !subcategory)) return false;
    const key = fingerprint(
      { type: r.type, amount: r.amount, currency: r.currency, accountId: account.id!, toAccountId: toAccount?.id, categoryId: category?.id, subcategoryId: subcategory?.id, note: r.note, toAmount: r.toAmount, toCurrency: r.toCurrency },
      r.day,
    );
    const left = saved.get(key) ?? 0;
    if (left) saved.set(key, left - 1);
    return left > 0;
  };

  /** What the readable rows give categories to, new or already saved: their flows, and categories by subcategory. */
  const categorized: Row[] = [];
  const rowsOnDay = new Map<string, number>();
  rows.forEach((cells, i) => {
    const rowNumber = i + 2;
    if (cells.every((c) => !c.trim())) return;
    const r = readRow((column) => (cells[columns.indexOf(column)] ?? '').trim());
    if (!r || !fitsAccounts(r)) {
      plan.badRows.push(rowNumber);
      return;
    }
    if (r.category && r.type !== 'transfer') categorized.push(r);
    if (alreadySaved(r)) {
      plan.duplicates++;
      return;
    }
    const seconds = rowsOnDay.get(r.day) ?? 0;
    rowsOnDay.set(r.day, seconds + 1);
    // Midday local time keeps the row on its day, and the seconds keep rows in the file's order.
    const [y, mo, d] = r.date;
    const date = new Date(y, mo - 1, d, 12, 0, seconds).toISOString();
    const t: Transaction = { type: r.type, amount: r.amount, currency: r.currency, accountId: accountFor(r.account, r.currency).id!, date, createdAt: stamp };
    if (r.note) t.note = r.note;
    if (r.type === 'transfer') {
      t.toAccountId = accountFor(r.toAccount, r.toCurrency ?? r.currency).id;
      if (r.toCurrency) {
        t.toAmount = r.toAmount;
        t.toCurrency = r.toCurrency;
      }
    } else {
      if (r.category) {
        const c = categoryFor(r.category, r.type);
        t.categoryId = c.id;
        if (r.subcategory) t.subcategoryId = subcategoryFor(c, r.subcategory).id;
      }
      if (r.rate) {
        t.rate = r.rate;
        t.rateCurrency = r.rateCurrency;
      }
    }
    plan.transactions.push(t);
  });

  const unused = unusedAfter(
    data.categories.filter(alive),
    [...data.transactions.filter(alive), ...plan.transactions],
    new Set(categorized.map((r) => r.type as Flow)),
    new Set(categorized.filter((r) => r.subcategory).map((r) => findCategory(r.category, r.type as Flow)?.id)),
  );
  plan.unusedCategories = unused.categories;
  plan.unusedSubcategories = unused.subcategories;
  return plan;
}

/**
 * Categories (and subcategories) no transaction uses. A category goes only when the file gives categories
 * to every flow it takes ("both" needs expenses and income); a subcategory only when the file gives
 * subcategories to its category. A file without categories therefore removes nothing.
 */
function unusedAfter(categories: Category[], transactions: Transaction[], flows: Set<Flow>, withSubcategories: Set<string | undefined>) {
  const usedCategories = new Set(transactions.map((t) => t.categoryId));
  const usedSubcategories = new Set(transactions.map((t) => t.subcategoryId));
  const covered = (c: Category) => (c.kind === 'both' ? flows.has('expense') && flows.has('income') : flows.has(c.kind));
  const gone = categories.filter((c) => !usedCategories.has(c.id) && covered(c));
  return {
    categories: gone,
    subcategories: categories
      .filter((c) => !gone.includes(c) && withSubcategories.has(c.id))
      .map((c) => ({ categoryId: c.id!, ids: (c.subcategories ?? []).filter((s) => !usedSubcategories.has(s.id)).map((s) => s.id) }))
      .filter((x) => x.ids.length),
  };
}

/**
 * Adds a plan's records to the data, and with `removeUnused` deletes the categories and subcategories it
 * found unused. The write hooks stamp everything, so sync uploads it like any local change.
 */
export async function saveCsvImport(plan: CsvPlan, { removeUnused = false } = {}): Promise<void> {
  await db.transaction('rw', db.accounts, db.categories, db.transactions, async () => {
    await db.accounts.bulkAdd(plan.newAccounts);
    await db.categories.bulkAdd(plan.newCategories);
    const subcategories = new Map(plan.changedCategories.map((c) => [c.id!, c.subcategories ?? []]));
    if (removeUnused) {
      await softDelete(db.categories, plan.unusedCategories.map((c) => c.id!));
      for (const { categoryId, ids } of plan.unusedSubcategories) {
        const list = subcategories.get(categoryId) ?? (await db.categories.get(categoryId))?.subcategories ?? [];
        subcategories.set(categoryId, list.filter((s) => !ids.includes(s.id)));
      }
    }
    await Promise.all([...subcategories].map(([id, list]) => db.categories.update(id, { subcategories: list })));
    await db.transactions.bulkAdd(plan.transactions);
  });
}

/** Whether a plan found any category or subcategory it could delete. */
export const hasUnused = (plan: CsvPlan) => plan.unusedCategories.length > 0 || plan.unusedSubcategories.length > 0;
