import { useTranslation } from 'react-i18next';
import { useTxEditor } from '@/core/contexts/TxEditorContext';
import { useAccounts, useCategories } from '@/core/db/hooks';
import { payFromAccount } from '@/core/utils/creditCard';
import { lastAccount } from '@/features/transactions/TransactionEditor';
import type { Account } from '@/shared/models';

export interface CardActions {
  /** A transfer to the card from the account it's usually paid from, starting at `amount`. */
  pay: (amount?: number) => void;
  addPurchase: () => void;
  /** An expense on the card in Bills, noted "Interest / fees". */
  addFee: () => void;
}

/** The quick actions on a credit card's page. */
export function useCardActions(account: Account): CardActions {
  const { t } = useTranslation();
  const openEditor = useTxEditor();
  const accounts = useAccounts();
  const expenseCats = useCategories('expense');

  const pay = (amount?: number) =>
    openEditor({ type: 'transfer', accountId: payFromAccount(accounts ?? [], account, lastAccount()), toAccountId: account.id, amount });
  return {
    pay,
    addPurchase: () => openEditor({ type: 'expense', accountId: account.id }),
    addFee: () =>
      openEditor({ type: 'expense', accountId: account.id, categoryId: expenseCats?.find((c) => c.key === 'bills')?.id, note: t('cards.feeNote') }),
  };
}
