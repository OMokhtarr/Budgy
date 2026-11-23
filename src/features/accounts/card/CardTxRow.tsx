import { useTranslation } from 'react-i18next';
import { useMoney } from '@/core/contexts/SettingsContext';
import { useTxEditor } from '@/core/contexts/TxEditorContext';
import { useLookups, useNames } from '@/core/db/hooks';
import { changeOn } from '@/core/utils/lending';
import Avatar from '@/shared/components/Avatar';
import MoneyText from '@/shared/components/MoneyText';
import type { Transaction } from '@/shared/models';
import { useDayMonth } from './CardBlocks';

/**
 * A transaction as the card sees it: what it is, when, and the money in or out of the card. Tapping it opens it in
 * the editor, after `onOpen` (a sheet closing itself first, say).
 */
export default function CardTxRow({ tx, cardId, onOpen }: { tx: Transaction; cardId: string; onOpen?: () => void }) {
  const { t } = useTranslation();
  const money = useMoney();
  const openEditor = useTxEditor();
  const { accounts, categories } = useLookups();
  const { accountName, categoryName } = useNames();
  const dayMonth = useDayMonth();
  const transfer = tx.type === 'transfer';
  const cat = transfer ? undefined : categories.get(tx.categoryId!);
  const title = transfer
    ? `${accountName(accounts.get(tx.accountId))} → ${accountName(accounts.get(tx.toAccountId!))}`
    : categoryName(cat);
  const open = () => {
    onOpen?.();
    openEditor({ tx });
  };
  return (
    <button className="b-row" onClick={open}>
      {transfer ? <Avatar icon="transfer" color="var(--b-transfer)" /> : <Avatar icon={cat?.icon ?? 'other'} color={cat?.color ?? '#64748b'} />}
      <div className="b-row__main">
        <div className="b-row__title">
          {title}
          {tx.instalment && <span className="b-row__tag">{t('instalments.tag', tx.instalment)}</span>}
        </div>
        <div className="b-row__sub">
          <span>{transfer ? t('type.transfer') : tx.note || ''}</span>
          <span className="b-row__date">· {dayMonth(new Date(tx.date))}</span>
        </div>
      </div>
      <div className="b-row__amount b-num">
        {changeOn(tx, cardId).map(([delta, cur], i) => (
          // Colour tells money out from money in; the plus keeps money in readable without it, as on Transactions.
          <div key={i} className={delta < 0 ? 'b-expense' : 'b-income'} dir="ltr">
            {delta > 0 && '+'}
            <MoneyText currency={cur} text={money.plain(Math.abs(delta), cur)} />
          </div>
        ))}
      </div>
    </button>
  );
}
