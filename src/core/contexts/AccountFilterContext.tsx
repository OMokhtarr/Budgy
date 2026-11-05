import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useAccounts, useTransactionsInRange } from '@/core/db/hooks';
import { forgetAccount, resolveFilter, tileIsSpending, selectedByDefault, type FilterOverrides } from '@/core/utils/accountFilter';
import type { TileScope } from '@/core/utils/accountTiles';
import type { DateRange, Transaction } from '@/shared/models';

/**
 * The accounts filter (tap the balance at the top of a tab). By default it follows each account's
 * "Include in total balance" and "Display in expenses" switches; accounts can then be added or removed.
 * Only those changes are stored, so accounts created later are picked up automatically.
 */
interface AccountFilterValue {
  /** Ids of the accounts ticked in the filter. */
  selected: Set<string>;
  /** Ids of the selected accounts whose balance counts in the total at the top. */
  inTotal: Set<string>;
  /** Ids of the selected accounts whose expenses and income are shown. */
  inExpenses: Set<string>;
  /** The debt and savings tiles among the categories, for counting the money moved to them as spending. */
  tiles: TileScope;
  isDefault: boolean;
  setSelected: (ids: Set<string>) => void;
  /** Back to the default selection, e.g. after a restore, when the stored ids may name other accounts. */
  reset: () => void;
  /** Lets an account's switches decide again after the user changed them. */
  forget: (id: string) => void;
  /** Whether a transaction touches an account whose expenses and income are shown. */
  matches: (t: Transaction) => boolean;
}

const STORAGE_KEY = 'budgy-account-filter';
const EMPTY: FilterOverrides = { add: [], remove: [] };

function load(): FilterOverrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

function save(overrides: FilterOverrides) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    /* storage unavailable */
  }
}

const AccountFilterContext = createContext<AccountFilterValue | null>(null);

export function AccountFilterProvider({ children }: { children: React.ReactNode }) {
  // Archived accounts keep the selection they had, so their past transactions still show up in
  // categories, transactions and reports; they just aren't offered in the filter sheet.
  const accounts = useAccounts(true);
  const [overrides, setOverrides] = useState<FilterOverrides>(load);

  const { selected, inTotal, inExpenses } = useMemo(() => resolveFilter(accounts ?? [], overrides), [accounts, overrides]);
  // Debt and savings tiles count whatever the filter says; only the account the money comes from has to be shown.
  const tiles = useMemo<TileScope>(
    () => ({ tileIds: new Set((accounts ?? []).filter(tileIsSpending).map((a) => a.id!)), shownIds: inExpenses }),
    [accounts, inExpenses],
  );

  const setSelected = useCallback(
    (ids: Set<string>) => {
      const all = accounts ?? [];
      const keep = new Set(ids);
      for (const a of all) if (a.archived && selected.has(a.id!)) keep.add(a.id!);
      const next: FilterOverrides = {
        add: all.filter((a) => !selectedByDefault(a) && keep.has(a.id!)).map((a) => a.id!),
        remove: all.filter((a) => selectedByDefault(a) && !keep.has(a.id!)).map((a) => a.id!),
      };
      setOverrides(next);
      save(next);
    },
    [accounts, selected],
  );

  const forget = useCallback(
    (id: string) => {
      const next = forgetAccount(overrides, id);
      setOverrides(next);
      save(next);
    },
    [overrides],
  );

  const reset = useCallback(() => {
    setOverrides(EMPTY);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const value = useMemo<AccountFilterValue>(
    () => ({
      selected,
      inTotal,
      inExpenses,
      tiles,
      isDefault: overrides.add.length === 0 && overrides.remove.length === 0,
      setSelected,
      reset,
      forget,
      matches: (t) => inExpenses.has(t.accountId) || (t.toAccountId != null && inExpenses.has(t.toAccountId)),
    }),
    [selected, inTotal, inExpenses, tiles, overrides, setSelected, reset, forget],
  );

  return <AccountFilterContext.Provider value={value}>{children}</AccountFilterContext.Provider>;
}

export function useAccountFilter() {
  const ctx = useContext(AccountFilterContext);
  if (!ctx) throw new Error('useAccountFilter must be used inside AccountFilterProvider');
  return ctx;
}

/** Transactions in the period that touch the accounts picked in the filter. */
export function useFilteredTransactionsInRange(range: DateRange): Transaction[] | undefined {
  const txs = useTransactionsInRange(range);
  const { matches } = useAccountFilter();
  return useMemo(() => txs?.filter(matches), [txs, matches]);
}
