import { IonIcon, IonModal } from '@ionic/react';
import { addOutline, chevronForwardOutline, closeOutline, createOutline, receiptOutline, swapHorizontalOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { useMoney } from '@/core/contexts/SettingsContext';
import { useCardStatuses, useNames } from '@/core/db/hooks';
import Avatar from '@/shared/components/Avatar';
import type { CardStatus } from '@/core/utils/creditCard';
import type { Account } from '@/shared/models';
import { CycleRows, OwedBlock, StatementRows, useDayMonth } from './card/CardBlocks';
import { useCardActions } from './card/useCardActions';
import { useOpenCardPage } from './card/useOpenCardPage';

interface Props {
  account?: Account;
  onClose: () => void;
  onEdit: (a: Account) => void;
}

/** A credit card at a glance: what's owed, the limit, the last statement and this cycle, and quick actions. */
export default function CreditCardSheet({ account, onClose, onEdit }: Props) {
  return (
    <IonModal className="b-sheet-modal" isOpen={!!account} breakpoints={[0, 1]} initialBreakpoint={1} handle={false} onDidDismiss={onClose}>
      {account && <CardBody account={account} onClose={onClose} onEdit={onEdit} />}
    </IonModal>
  );
}

function CardBody({ account, onClose, onEdit }: Props & { account: Account }) {
  const status = useCardStatuses()?.get(account.id!);
  if (!account.credit || !status) return null;
  return <CardSheetBody account={account} status={status} onClose={onClose} onEdit={onEdit} />;
}

function CardSheetBody({ account, status, onClose, onEdit }: Props & { account: Account; status: CardStatus }) {
  const { t } = useTranslation();
  const money = useMoney();
  const openCardPage = useOpenCardPage();
  const { accountName } = useNames();
  const dayMonth = useDayMonth();
  const actions = useCardActions(account, status);
  const own = status.byCurrency[account.currency];

  const act = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const openPage = act(() => openCardPage(account.id!));

  return (
    <div className="b-sheet">
      <div className="b-sheet__head">
        <button className="b-iconbtn" onClick={onClose} aria-label={t('common.close')}>
          <IonIcon icon={closeOutline} />
        </button>
        <Avatar icon={account.icon} color={account.color} size="sm" square />
        <h2 className="b-card-sheet__title">{accountName(account)}</h2>
        <button className="b-iconbtn" onClick={act(() => onEdit(account))} aria-label={t('cards.edit')}>
          <IonIcon icon={createOutline} />
        </button>
      </div>

      <div className="b-sheet__body">
        <OwedBlock account={account} status={status} />

        <div className="b-section-title">{t('cards.statementOf', { date: dayMonth(status.cycle.statementOn) })}</div>
        <div className="b-card b-cc">
          <StatementRows account={account} status={status} />
          <CycleRows account={account} status={status} />
        </div>

        <div className="b-cc__actions">
          {actions.payMinimum && (
            <button className="b-btn b-btn--muted" onClick={act(actions.payMinimum)}>
              <IonIcon icon={swapHorizontalOutline} />
              {t('cards.payMinimum')}
            </button>
          )}
          <button className="b-btn b-btn--muted" onClick={act(actions.addFee)}>
            <IonIcon icon={receiptOutline} />
            {t('cards.addFee')}
          </button>
          <button className="b-btn b-btn--muted" onClick={openPage}>
            {t('cards.details')}
            <IonIcon icon={chevronForwardOutline} className="b-flip" />
          </button>
        </div>
        <p className="b-muted b-hint">{t('cards.hint')}</p>
      </div>

      <div className="b-sheet__foot">
        <button className="b-btn b-btn--muted" onClick={act(actions.addPurchase)}>
          <IonIcon icon={addOutline} />
          {t('cards.addPurchase')}
        </button>
        <button className="b-btn b-btn--primary" onClick={act(() => actions.pay(own.due || undefined))}>
          <IonIcon icon={swapHorizontalOutline} />
          {own.due ? t('cards.payAmount', { amount: money.format(own.due, account.currency) }) : t('cards.pay')}
        </button>
      </div>
    </div>
  );
}
