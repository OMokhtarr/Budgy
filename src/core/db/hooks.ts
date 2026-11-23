import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { useCallback, useMemo } from 'react';
import { alive, db } from './db';
import { everydayShiftsOf, moveInBase, tileMoveOf, type Money, type TileScope } from '@/core/utils/accountTiles';
import { txInBase, type BaseConverter } from '@/core/utils/txRate';
import { groupOf, openingOf, roundTo } from '@/core/utils/currency';
import { lendingShares, type LendingShares } from '@/core/utils/lending';
import { cardStatus, isCreditCard, type CardStatus } from '@/core/utils/creditCard';
import { flowOfTx, isMoneyBack } from '@/core/utils/flow';
import { hiddenUntilItsDay, isAfterToday } from '@/core/utils/future';
import type { Account, Amounts, Category, DateRange, Flow, Subcategory, Transaction } from '@/shared/models';

export function useAccounts(includeArchived = false): Account[] | undefined {
  return useLiveQuery(async () => {
    const all = await db.accounts.orderBy('order').filter(alive).toArray();
    return includeArchived ? all : all.filter((a) => !a.archived);
  }, [includeArchived]);
}

/** Whether a category accepts expenses or income ("both" categories accept either). */
export function categoryFits(c: Category, flow: Flow): boolean {
  return c.kind === flow || c.kind === 'both';
}

/** Categories usable for `flow` (including "both" ones), or all categories when no flow is given. */
export function useCategories(flow?: Flow, includeArchived = false): Category[] | undefined {
  return useLiveQuery(async () => {
    const all = await db.categories.orderBy('order').filter(alive).toArray();
    return all.filter((c) => (!flow || categoryFits(c, flow)) && (includeArchived || !c.archived));
  }, [flow, includeArchived]);
}

/**
 * The period's transactions, newest first. A credit card entry dated after today is left out until its day: it
 * isn't paid yet, so the Transactions list, Categories, Overview and budgets don't count it. The card page reads
 * its own transactions and still shows it.
 */
export function useTransactionsInRange(range: DateRange): Transaction[] | undefined {
  const s = range.start.toISOString();
  const e = range.end.toISOString();
  return useLiveQuery(
    async () => {
      const [found, accounts] = await Promise.all([
        db.transactions.where('date').between(s, e, true, false).filter(alive).toArray(),
        db.accounts.filter(alive).toArray(),
      ]);
      const cardIds = new Set(accounts.filter(isCreditCard).map((a) => a.id!));
      const today = new Date();
      const rows = found.filter((t) => !hiddenUntilItsDay(t, cardIds, today));
      // newest first; ties broken by creation time
      return rows.sort((a, b) => (b.date === a.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)));
    },
    [s, e],
  );
}

/**
 * Current balance of every account, per currency
 * (opening balances + all movements, regardless of the selected period).
 */
export function useBalances(): Map<string, Amounts> | undefined {
  return useLiveQuery(async () => {
    const [accounts, txs] = await Promise.all([db.accounts.filter(alive).toArray(), db.transactions.filter(alive).toArray()]);
    return balancesOf(accounts, txs);
  });
}

/**
 * Each account's balance per currency: its opening balances plus every transaction's movement on it. A movement
 * dated after `today` waits for its day, except money taken off a credit card (the bank takes it off the limit at
 * once, as with instalments to come) and an exchange inside one card, which counts whole.
 */
export function balancesOf(accounts: Account[], txs: Transaction[], today = new Date()): Map<string, Amounts> {
  const map = new Map<string, Amounts>();
  const cardIds = new Set<string>();
  accounts.forEach((a) => {
    map.set(a.id!, openingOf(a));
    if (isCreditCard(a)) cardIds.add(a.id!);
  });
  const add = (id: string | undefined, cur: string, v: number, waits: boolean) => {
    const m = id == null ? undefined : map.get(id);
    if (!m || (waits && !(v < 0 && cardIds.has(id!)))) return;
    m[cur] = roundTo((m[cur] ?? 0) + v, cur);
  };
  for (const t of txs) {
    const exchange = t.type === 'transfer' && t.accountId === t.toAccountId && cardIds.has(t.accountId);
    const waits = !exchange && isAfterToday(t.date, today);
    if (t.type === 'expense') add(t.accountId, t.currency, -t.amount, waits);
    else if (t.type === 'income') add(t.accountId, t.currency, t.amount, waits);
    else {
      add(t.accountId, t.currency, -t.amount, waits);
      add(t.toAccountId, t.toCurrency ?? t.currency, t.toAmount ?? t.amount, waits);
    }
  }
  return map;
}

/** How much of each transfer to or from a debt was lending, over each debt's whole history. */
export function useLendingShares(): LendingShares | undefined {
  return useLiveQuery(async () => {
    const debts = (await db.accounts.filter(alive).toArray()).filter((a) => groupOf(a) === 'debt');
    if (!debts.length) return new Map();
    const ids = debts.map((a) => a.id!);
    const txs = await db.transactions.where('accountId').anyOf(ids).or('toAccountId').anyOf(ids).filter(alive).toArray();
    return lendingShares(debts, txs);
  });
}

/** Where each credit card stands in its statement cycle today, by account id. */
export function useCardStatuses(): Map<string, CardStatus> | undefined {
  return useLiveQuery(async () => {
    const cards = (await db.accounts.filter(alive).toArray()).filter(isCreditCard);
    if (!cards.length) return new Map();
    const ids = cards.map((a) => a.id!);
    const txs = await db.transactions.where('accountId').anyOf(ids).or('toAccountId').anyOf(ids).filter(alive).toArray();
    const today = new Date();
    return new Map(cards.map((a) => [a.id!, cardStatus(a, txs, today)]));
  });
}

/**
 * What each credit card page last read: its card (null once deleted or archived) and the card's transactions.
 * The page starts from it, so it has them on its first frame instead of a moment later, when its own live
 * queries answer, and slides in whole.
 */
const cardPages = new Map<string, { account?: Account | null; txs?: Transaction[] }>();
const remember = (cardId: string, part: { account?: Account | null; txs?: Transaction[] }) =>
  cardPages.set(cardId, { ...cardPages.get(cardId), ...part });

async function readCardAccount(cardId: string): Promise<Account | null> {
  const a = await db.accounts.get(cardId);
  const account = a && alive(a) && !a.archived ? a : null;
  remember(cardId, { account });
  return account;
}

async function readCardTransactions(cardId: string): Promise<Transaction[]> {
  const txs = await db.transactions.where('accountId').equals(cardId).or('toAccountId').equals(cardId).filter(alive).toArray();
  remember(cardId, { txs });
  return txs;
}

/** Reads a card and its transactions ahead of opening its page. */
export async function preloadCardPage(cardId: string): Promise<void> {
  await Promise.all([readCardAccount(cardId), readCardTransactions(cardId)]);
}

/** What a card's page would start from. */
export function cachedCardPage(cardId: string): { account?: Account | null; txs?: Transaction[] } {
  return { ...cardPages.get(cardId) };
}

/** A card's page's own account: undefined while loading, null once it's deleted, archived or missing. */
export function useCardAccount(cardId: string): Account | null | undefined {
  // Only a card found is a head start: one remembered as gone may be back since, and must not send the page away.
  return useLiveQuery(() => readCardAccount(cardId), [cardId], cardPages.get(cardId)?.account ?? undefined);
}

/** One card's live transactions: those on it and transfers to it. */
export function useCardTransactions(cardId: string): Transaction[] | undefined {
  return useLiveQuery(() => readCardTransactions(cardId), [cardId], cardPages.get(cardId)?.txs);
}

/**
 * Currencies that hold an opening balance or appear in any transaction. Totals need an exchange
 * rate for each of these; without one their amounts are left out.
 */
export function useCurrenciesInUse(): string[] | undefined {
  return useLiveQuery(async () => {
    const [accounts, txs] = await Promise.all([db.accounts.filter(alive).toArray(), db.transactions.filter(alive).toArray()]);
    const used = new Set<string>();
    for (const a of accounts) for (const [c, n] of Object.entries(openingOf(a))) if (n) used.add(c);
    for (const t of txs) {
      used.add(t.currency);
      if (t.toCurrency) used.add(t.toCurrency);
    }
    return [...used];
  });
}

/** Display-name helpers that translate the built-in accounts/categories. */
export function useNames() {
  const { t } = useTranslation();
  const accountName = useCallback(
    (a?: Account) => (!a ? t('common.deleted') : a.name || t(a.key ? `accounts.starter.${a.key}` : `accountType.${a.type}`)),
    [t],
  );
  const categoryName = useCallback(
    (c?: Category) => (!c ? t('common.uncategorized') : c.name || (c.key ? t(`cat.${c.key}`) : '')),
    [t],
  );
  return { accountName, categoryName };
}

export function useLookups() {
  const accounts = useAccounts(true);
  const categories = useCategories(undefined, true);
  return useMemo(() => ({
    accounts: new Map((accounts ?? []).map((a) => [a.id!, a])),
    categories: new Map((categories ?? []).map((c) => [c.id!, c])),
    ready: !!accounts && !!categories,
  }), [accounts, categories]);
}

export interface PeriodTotals {
  expense: number;
  income: number;
  /** Per-category totals, kept apart so a "both" category's spending and income don't mix. */
  byCategory: Record<Flow, Map<string, number>>;
  /** Per-category totals in their original currencies, e.g. { EGP: 120, USD: 10 }. */
  byCategoryCur: Record<Flow, Map<string, Amounts>>;
  /** Per-subcategory totals. */
  bySubcategory: Record<Flow, Map<string, number>>;
  /** Money sent to each account tile minus what came back: already part of `expense`. */
  byTile: Map<string, { value: number; amounts: Amounts }>;
}

/**
 * Income/expense totals in the main currency, each transaction at its own rate if it has one.
 * With `tiles`, money moved to and from those accounts counts in the expenses too.
 */
export function totalsOf(txs: Transaction[] | undefined, conv: BaseConverter, tiles?: TileScope): PeriodTotals {
  const byCategory: Record<Flow, Map<string, number>> = { expense: new Map(), income: new Map() };
  const byCategoryCur: Record<Flow, Map<string, Amounts>> = { expense: new Map(), income: new Map() };
  const bySubcategory: Record<Flow, Map<string, number>> = { expense: new Map(), income: new Map() };
  const byTile: PeriodTotals['byTile'] = new Map();
  let expense = 0;
  let income = 0;
  const addToTile = (tileId: string, value: number, sign: 1 | -1, [amount, currency]: Money) => {
    const entry = byTile.get(tileId) ?? { value: 0, amounts: {} };
    entry.value += value;
    entry.amounts[currency] = roundTo((entry.amounts[currency] ?? 0) + sign * amount, currency);
    byTile.set(tileId, entry);
  };
  for (const t of txs ?? []) {
    if (t.type === 'transfer') {
      if (!tiles) continue;
      const move = tileMoveOf(t, tiles);
      if (move) {
        const value = moveInBase(move, conv);
        addToTile(move.tileId, value, move.sign, move.onTile);
        expense += value;
      }
      // Everyday tiles only show what moved; it isn't spending.
      for (const s of everydayShiftsOf(t, tiles)) addToTile(s.tileId, s.sign * conv.toBase(...s.onTile), s.sign, s.onTile);
      continue;
    }
    // Money back counts against spending in its category, never as income.
    const flow = flowOfTx(t)!;
    const sign = isMoneyBack(t) ? -1 : 1;
    const v = sign * txInBase(t, conv);
    if (flow === 'expense') expense += v;
    else income += v;
    if (t.categoryId == null) continue;
    const m = byCategory[flow];
    m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + v);
    const raw = byCategoryCur[flow].get(t.categoryId) ?? {};
    raw[t.currency] = roundTo((raw[t.currency] ?? 0) + sign * t.amount, t.currency);
    byCategoryCur[flow].set(t.categoryId, raw);
    if (t.subcategoryId != null) bySubcategory[flow].set(t.subcategoryId, (bySubcategory[flow].get(t.subcategoryId) ?? 0) + v);
  }
  return { expense, income, byCategory, byCategoryCur, bySubcategory, byTile };
}

/** What the budgeted categories spent in total; one below zero (more came back than was spent) counts as nothing. */
export function budgetSpent(totals: PeriodTotals, categoryIds: string[]): number {
  return categoryIds.reduce((s, id) => s + Math.max(0, totals.byCategory.expense.get(id) ?? 0), 0);
}

/**
 * How a category's total splits: subcategories with money in them (highest first), and the `rest`
 * with no subcategory. Empty when none were used, as the category's own row already says it all.
 */
export function subcategoryBreakdown(c: Category, flow: Flow, totals: PeriodTotals): { subs: { sub: Subcategory; value: number }[]; rest: number } {
  const subs = (c.subcategories ?? [])
    .map((sub) => ({ sub, value: totals.bySubcategory[flow].get(sub.id) ?? 0 }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
  if (!subs.length) return { subs, rest: 0 };
  const rest = (totals.byCategory[flow].get(c.id!) ?? 0) - subs.reduce((sum, x) => sum + x.value, 0);
  // Adding decimals can leave a tiny remainder that isn't real money.
  return { subs, rest: rest > 1e-6 ? rest : 0 };
}
