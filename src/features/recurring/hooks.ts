import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { alive, db } from '@/core/db/db';
import { useLookups, useNames } from '@/core/db/hooks';
import { useConverter, useMoney } from '@/core/contexts/SettingsContext';
import { dueDays } from '@/core/utils/recurring';
import { rateToSave } from '@/core/utils/txRate';
import type { Recurring } from '@/shared/models';
import type { RateFor } from './actions';

/** Every recurring transaction, soonest first. */
export function useRecurring(): Recurring[] | undefined {
  return useLiveQuery(async () => (await db.recurring.filter(alive).toArray()).sort((a, b) => a.next.localeCompare(b.next)));
}

export interface Due {
  r: Recurring;
  /** Days waiting to be added or skipped, oldest first. */
  days: string[];
}

/** The recurring transactions waiting for the user: due, and not set to add automatically. */
export function useDue(): Due[] | undefined {
  const all = useRecurring();
  if (!all) return undefined;
  const today = new Date();
  return all.filter((r) => !r.auto).map((r) => ({ r, days: dueDays(r, today) })).filter((d) => d.days.length > 0);
}

/** Today's saved rate for a currency, as a new transaction in it would get. */
export function useRateFor(): RateFor {
  const conv = useConverter();
  return useCallback(
    (currency: string) => rateToSave({ typed: undefined, saved: conv.rate(currency), editing: undefined, currency, base: conv.base }),
    [conv],
  );
}

/** A recurring transaction's name (its note, else its category or accounts) and amount, for lists and reminders. */
export function useRecurringLabel() {
  const { t } = useTranslation();
  const money = useMoney();
  const { accounts, categories } = useLookups();
  const { accountName, categoryName } = useNames();
  return useCallback(
    (r: Recurring) => {
      const { tx } = r;
      const name =
        tx.note
        || (tx.type === 'transfer'
          ? t('recurring.transferName', { from: accountName(accounts.get(tx.accountId)), to: accountName(accounts.get(tx.toAccountId ?? '')) })
          : categoryName(categories.get(tx.categoryId ?? '')));
      return { name, amount: money.format(tx.amount, tx.currency) };
    },
    [t, money, accounts, categories, accountName, categoryName],
  );
}
