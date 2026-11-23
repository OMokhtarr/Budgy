import { IonIcon, IonModal } from '@ionic/react';
import { closeOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { useMoney } from '@/core/contexts/SettingsContext';
import type { UpcomingStatement } from '@/core/utils/creditCard';
import MoneyText from '@/shared/components/MoneyText';
import type { Account, CreditCard } from '@/shared/models';
import { useDayMonth } from './CardBlocks';
import CardTxRow from './CardTxRow';

/** What's on one upcoming statement: the last statement's unpaid rest (the next one only), then each charge. */
export default function StatementSheet({ account, statement, onClose }: {
  account: Account & { credit: CreditCard };
  /** The statement to show; null keeps the sheet closed. */
  statement: UpcomingStatement | null;
  onClose(): void;
}) {
  const { t } = useTranslation();
  const money = useMoney();
  const dayMonth = useDayMonth();
  // The main currency first, as on the rest of the card page.
  const carried = Object.entries(statement?.carried ?? {}).sort(([a]) => (a === account.currency ? -1 : 1));
  const charges = statement?.charges ?? [];

  return (
    <IonModal className="b-sheet-modal" isOpen={statement != null} breakpoints={[0, 1]} initialBreakpoint={1} handle={false} onDidDismiss={onClose}>
      <div className="b-sheet">
        <div className="b-sheet__head">
          <button className="b-iconbtn" onClick={onClose} aria-label={t('common.close')}>
            <IonIcon icon={closeOutline} />
          </button>
          <h2>{statement && t('cards.statementSheetTitle', { date: dayMonth(statement.statementOn), due: dayMonth(statement.dueOn) })}</h2>
        </div>
        <div className="b-sheet__body">
          <div className="b-card b-rlist">
            {carried.length > 0 && (
              <div className="b-row">
                <div className="b-row__main">
                  <div className="b-row__title">{t('cards.statementCarried')}</div>
                </div>
                <div className="b-row__amount b-num">
                  {carried.map(([c, n], j) => {
                    const text = <MoneyText currency={c} text={money.plain(n, c)} />;
                    return j === 0 ? <div key={c}>{text}</div> : <small key={c}>{text}</small>;
                  })}
                </div>
              </div>
            )}
            {charges.map((x) => <CardTxRow key={x.id} tx={x} cardId={account.id!} onOpen={onClose} />)}
            {!carried.length && !charges.length && <div className="b-cc__empty">{t('cards.statementEmpty')}</div>}
          </div>
        </div>
      </div>
    </IonModal>
  );
}
