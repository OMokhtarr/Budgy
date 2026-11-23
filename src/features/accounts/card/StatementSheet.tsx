import { useRef } from 'react';
import { IonIcon, IonModal } from '@ionic/react';
import { closeOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { useMoney } from '@/core/contexts/SettingsContext';
import type { UpcomingStatement } from '@/core/utils/creditCard';
import MoneyText from '@/shared/components/MoneyText';
import type { Account, Amounts, CreditCard } from '@/shared/models';
import { useDayMonth } from './CardBlocks';
import CardTxRow from './CardTxRow';

/**
 * What's on one upcoming statement: for the next one, the last statement's unpaid rest or what was paid beyond it;
 * then each charge.
 */
export default function StatementSheet({ account, statement, onClose }: {
  account: Account & { credit: CreditCard };
  /** The statement to show, kept up to date by the caller; null closes the sheet. */
  statement: UpcomingStatement | null;
  onClose(): void;
}) {
  const { t } = useTranslation();
  const dayMonth = useDayMonth();
  // While the sheet slides away its statement is already null; it keeps showing the last one instead of going blank.
  const last = useRef(statement);
  if (statement) last.current = statement;
  const shown = statement ?? last.current;
  const charges = shown?.charges ?? [];
  const extra = !!shown?.carried || !!shown?.credit;

  return (
    <IonModal className="b-sheet-modal" isOpen={statement != null} breakpoints={[0, 1]} initialBreakpoint={1} handle={false} onDidDismiss={onClose}>
      <div className="b-sheet">
        <div className="b-sheet__head">
          <button className="b-iconbtn" onClick={onClose} aria-label={t('common.close')}>
            <IonIcon icon={closeOutline} />
          </button>
          <h2>{shown && t('cards.statementSheetTitle', { date: dayMonth(shown.statementOn), due: dayMonth(shown.dueOn) })}</h2>
        </div>
        <div className="b-sheet__body">
          <div className="b-card b-rlist">
            {shown?.carried && <AmountsRow account={account} label={t('cards.statementCarried')} amounts={shown.carried} />}
            {shown?.credit && <AmountsRow account={account} label={t('cards.statementCredit')} amounts={shown.credit} credit />}
            {charges.map((x) => <CardTxRow key={x.id} tx={x} cardId={account.id!} onOpen={onClose} />)}
            {!extra && !charges.length && <div className="b-cc__empty">{t('cards.statementEmpty')}</div>}
          </div>
        </div>
      </div>
    </IonModal>
  );
}

/** A plain row of amounts, main currency first; `credit` shows them as money taken off the statement. */
function AmountsRow({ account, label, amounts, credit }: { account: Account; label: string; amounts: Amounts; credit?: boolean }) {
  const money = useMoney();
  const main = (c: string) => (c === account.currency ? 0 : 1);
  const lines = Object.entries(amounts).sort(([a], [b]) => main(a) - main(b));
  return (
    <div className="b-row">
      <div className="b-row__main">
        <div className="b-row__title">{label}</div>
      </div>
      <div className="b-row__amount b-num">
        {lines.map(([c, n], j) => {
          const text = (
            <span className={credit ? 'b-income' : undefined} dir="ltr">
              {credit && '−'}
              <MoneyText currency={c} text={money.plain(n, c)} />
            </span>
          );
          return j === 0 ? <div key={c}>{text}</div> : <small key={c}>{text}</small>;
        })}
      </div>
    </div>
  );
}
