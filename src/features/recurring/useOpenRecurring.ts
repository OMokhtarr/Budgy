import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocale } from '@/core/contexts/SettingsContext';
import { useTxEditor, type EditorInit } from '@/core/contexts/TxEditorContext';
import { dayKey, parseDayKey } from '@/core/utils/period';
import { occurrenceDate } from '@/core/utils/recurring';
import type { Recurring } from '@/shared/models';
import { useRecurringLabel } from './hooks';

/** The editor's starting values from a recurring transaction. */
function fill({ tx }: Recurring): EditorInit {
  return {
    type: tx.type,
    accountId: tx.accountId,
    toAccountId: tx.toAccountId,
    categoryId: tx.categoryId,
    subcategoryId: tx.subcategoryId,
    amount: tx.amount,
    note: tx.note,
    currency: tx.currency,
    moneyBack: tx.moneyBack,
    toAmount: tx.toAmount,
    toCurrency: tx.toCurrency,
  };
}

/** Opens the editor on a recurring transaction: to change it, to make a new one, or to add one that's due. */
export function useOpenRecurring() {
  const open = useTxEditor();
  const { t } = useTranslation();
  const locale = useLocale();
  const label = useRecurringLabel();

  const openRule = useCallback(
    (r: Recurring) => open({ ...fill(r), date: occurrenceDate(r.next), recurring: r, header: t('recurring.editHeader') }),
    [open, t],
  );
  const openNew = useCallback(() => open({ recurring: 'new', header: t('recurring.newHeader') }), [open, t]);
  const openDue = useCallback(
    (r: Recurring, day: string) => {
      const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(parseDayKey(day));
      const { name } = label(r);
      const header = day === dayKey(new Date()) ? t('recurring.dueTodayHeader', { name }) : t('recurring.dueHeader', { name, date });
      open({ ...fill(r), date: occurrenceDate(day), due: { r, day }, header });
    },
    [open, t, locale, label],
  );
  return useMemo(() => ({ openRule, openNew, openDue }), [openRule, openNew, openDue]);
}
