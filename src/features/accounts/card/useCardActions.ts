import { useTranslation } from 'react-i18next';
import { useTxEditor } from '@/core/contexts/TxEditorContext';
import { useAccounts, useCategories } from '@/core/db/hooks';
import { payFromAccount, type CardStatus } from '@/core/utils/creditCard';
import { lastAccount } from '@/features/transactions/TransactionEditor';
import type { Account } from '@/shared/models';

export interface CardActions {
  /** A transfer to the card from the account it's usually paid from, starting at `amount`. */
  pay: (amount?: number) => void;
  /** Pays what's left of the minimum; only when there's a minimum below what's left to pay. */
  payMinimum?: () => void;
  addPurchase: () => void;
  /** An expense on the card in Bills, noted "Interest / fees". */
  addFee: () => void;
}

/** The quick actions on a credit card, shared by its sheet and its page. */
export function useCardActions(account: Account, status: CardStatus): CardActions {
  const { t } = useTranslation();
  const openEditor = useTxEditor();
  const accounts = useAccounts();
  const expenseCats = useCategories('expense');
  const own = status.byCurrency[account.currency];
  const minimum = own.minimum ?? 0;

  const pay = (amount?: number) =>
    openEditor({ type: 'transfer', accountId: payFromAccount(accounts ?? [], account, lastAccount()), toAccountId: account.id, amount });
  return {
    pay,
    payMinimum: minimum > 0 && minimum < own.due ? () => pay(minimum) : undefined,
    addPurchase: () => openEditor({ type: 'expense', accountId: account.id }),
    addFee: () =>
      openEditor({ type: 'expense', accountId: account.id, categoryId: expenseCats?.find((c) => c.key === 'bills')?.id, note: t('cards.feeNote') }),
  };
}
