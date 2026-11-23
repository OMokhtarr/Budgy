import { useState } from 'react';
import { IonIcon } from '@ionic/react';
import { chevronDownOutline, chevronForwardOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { useMoney } from '@/core/contexts/SettingsContext';
import { upcomingStatements, type CardStatus } from '@/core/utils/creditCard';
import MoneyText from '@/shared/components/MoneyText';
import type { Account, CreditCard, Transaction } from '@/shared/models';
import { useDayMonth } from './CardBlocks';
import StatementSheet from './StatementSheet';

/** Statements listed before the rest fold away behind "Show all". */
const SHOWN = 4;

/** The statements to come: when each is made and due, and what's on it so far. Tapping one lists its charges. */
export default function UpcomingBlock({ account, status, txs }: {
  account: Account & { credit: CreditCard };
  status: CardStatus;
  txs: Transaction[];
}) {
  const { t } = useTranslation();
  const money = useMoney();
  const dayMonth = useDayMonth();
  const [showAll, setShowAll] = useState(false);
  // The open statement by its date, so the sheet follows the live figures (a sync or a recurring add while it's open).
  const [openOn, setOpenOn] = useState<number | null>(null);
  const list = upcomingStatements(account, txs, status);
  const shown = showAll ? list : list.slice(0, SHOWN);

  return (
    <>
      <div className="b-section-title">{t('cards.upcomingTitle')}</div>
      <div className="b-card b-rlist">
        {shown.map((s, i) => {
          // The main currency always; a second one only when something is on it.
          const lines = Object.entries(s.byCurrency).filter(([c, n]) => c === account.currency || n > 0);
          const due = t('cards.upcomingDue', { due: dayMonth(s.dueOn) });
          return (
            <button key={s.statementOn.getTime()} className="b-row" onClick={() => setOpenOn(s.statementOn.getTime())}>
              <div className="b-row__main">
                <div className="b-row__title">{dayMonth(s.statementOn)}</div>
                <div className="b-row__sub">{i === 0 ? `${due} · ${t('cards.upcomingSoFar')}` : due}</div>
              </div>
              <div className="b-row__amount b-num">
                {lines.map(([c, n], j) => {
                  const text = <MoneyText currency={c} text={money.plain(n, c)} />;
                  return j === 0 ? <div key={c}>{text}</div> : <small key={c}>{text}</small>;
                })}
              </div>
            </button>
          );
        })}
        {list.length > SHOWN && (
          <button className="b-row" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
            <div className="b-row__main">
              <div className="b-row__title">{showAll ? t('cards.upcomingFewer') : t('cards.upcomingAll', { count: list.length })}</div>
            </div>
            <IonIcon icon={showAll ? chevronDownOutline : chevronForwardOutline} className="b-flip" />
          </button>
        )}
        <div className="b-muted b-upcoming__note">{t('cards.upcomingNote')}</div>
      </div>
      <StatementSheet
        account={account}
        statement={list.find((s) => s.statementOn.getTime() === openOn) ?? null}
        onClose={() => setOpenOn(null)}
      />
    </>
  );
}
