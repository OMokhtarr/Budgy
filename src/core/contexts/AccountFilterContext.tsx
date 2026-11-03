import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useAccounts, useTransactionsInRange } from '@/core/db/hooks';
import { groupOf } from '@/core/utils/currency';
import type { Account, DateRange, Transaction } from '@/shared/models';

/**
 * The accounts filter (tap the balance at the top of a tab). By default every everyday account is
 * selected; savings and debt accounts can be added and everyday ones removed. Only those changes are
 * stored, so accounts created later are picked up automatically.
 */
interface Overrides {
  add: string[];
  remove: string[];
}

interface AccountFilterValue {
  /** Ids of the accounts the app currently shows. */
  selected: Set<string>;
  isDefault: boolean;
  setSelected: (ids: Set<string>) => void;
  /** Back to the default selection, e.g. after a restore, when the stored ids may name other accounts. */
  reset: () => void;
  /** Whether a transaction touches one of the selected accounts. */
  matches: (t: Transaction) => boolean;
}

const STORAGE_KEY = 'budgy-account-filter';
const EMPTY: Overrides = { add: [], remove: [] };

export const selectedByDefault = (a: Account) => groupOf(a) === 'regular';

function load(): Overrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

const AccountFilterContext = createContext<AccountFilterValue | null>(null);

export function AccountFilterProvider({ children }: { children: React.ReactNode }) {
  // Archived accounts keep the selection they had, so their past transactions still show up in
  // categories, transactions and reports; they just aren't offered in the filter sheet.
  const accounts = useAccounts(true);
  const [overrides, setOverrides] = useState<Overrides>(load);

  const selected = useMemo(
    () =>
      new Set(
        (accounts ?? [])
          .filter((a) => (selectedByDefault(a) && !overrides.remove.includes(a.id!)) || overrides.add.includes(a.id!))
          .map((a) => a.id!),
      ),
    [accounts, overrides],
  );

  const setSelected = useCallback(
    (ids: Set<string>) => {
      const all = accounts ?? [];
      const keep = new Set(ids);
      for (const a of all) if (a.archived && selected.has(a.id!)) keep.add(a.id!);
      const next: Overrides = {
        add: all.filter((a) => !selectedByDefault(a) && keep.has(a.id!)).map((a) => a.id!),
        remove: all.filter((a) => selectedByDefault(a) && !keep.has(a.id!)).map((a) => a.id!),
      };
      setOverrides(next);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
    },
    [accounts, selected],
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
      isDefault: overrides.add.length === 0 && overrides.remove.length === 0,
      setSelected,
      reset,
      matches: (t) => selected.has(t.accountId) || (t.toAccountId != null && selected.has(t.toAccountId)),
    }),
    [selected, overrides, setSelected, reset],
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
