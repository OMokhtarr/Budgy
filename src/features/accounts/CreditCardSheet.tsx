import type { ReactNode } from 'react';
import { IonIcon, IonModal } from '@ionic/react';
import { addOutline, closeOutline, createOutline, receiptOutline, swapHorizontalOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { useConverter, useLocale, useMoney } from '@/core/contexts/SettingsContext';
import { useTxEditor } from '@/core/contexts/TxEditorContext';
import { useAccounts, useCardStatuses, useCategories, useNames } from '@/core/db/hooks';
import { currenciesOf } from '@/core/utils/currency';
import { payFromAccount, REMIND_DAYS, type CardAmounts, type CardStatus } from '@/core/utils/creditCard';
import { lastAccount } from '@/features/transactions/TransactionEditor';
import Avatar from '@/shared/components/Avatar';
import MoneyText from '@/shared/components/MoneyText';
import type { Account } from '@/shared/models';

/** The limit bar turns red from this share of the limit used. */
const NEAR_LIMIT = 0.9;

interface Props {
  account?: Account;
  onClose: () => void;
  onEdit: (a: Account) => void;
}

/** A credit card at a glance: what's owed, the limit, the last statement and its due date, and quick actions. */
export default function CreditCardSheet({ account, onClose, onEdit }: Props) {
  return (
    <IonModal className="b-sheet-modal" isOpen={!!account} breakpoints={[0, 1]} initialBreakpoint={1} handle={false} onDidDismiss={onClose}>
      {account && <CardBody account={account} onClose={onClose} onEdit={onEdit} />}
    </IonModal>
  );
}

function CardBody({ account, onClose, onEdit }: Props & { account: Account }) {
  const { t } = useTranslation();
  const money = useMoney();
  const conv = useConverter();
  const { accountName } = useNames();
  const openEditor = useTxEditor();
  const accounts = useAccounts();
  const expenseCats = useCategories('expense');
  const status = useCardStatuses()?.get(account.id!);
  const dayMonth = useDayMonth();
  const credit = account.credit;
  if (!credit || !status) return null;

  const main = account.currency;
  const own = status.byCurrency[main];
  const others = currenciesOf(account).filter((c) => c !== main);
  /** An amount for each of the card's currencies: always the main one, the second only when it isn't zero. */
  const lines = (pick: (x: CardAmounts) => number | undefined): ReactNode => {
    const shown = currenciesOf(account).filter((c) => c === main || (pick(status.byCurrency[c]) ?? 0) > 0);
    return shown.map((c) => (
      <span key={c} className="b-group__line">
        <MoneyText currency={c} text={money.plain(pick(status.byCurrency[c]) ?? 0, c)} />
      </span>
    ));
  };

  // One limit covers every currency on the card, so the second one counts at the saved rate.
  const used = own.owed + others.reduce((s, c) => s + (conv.convert(status.byCurrency[c].owed, c, main) ?? 0), 0);
  const limit = credit.limit;
  const share = limit ? used / limit : 0;
  const hasMinimum = own.minimum != null;

  const act = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const pay = (amount?: number) =>
    openEditor({ type: 'transfer', accountId: payFromAccount(accounts ?? [], account, lastAccount()), toAccountId: account.id, amount });
  const addPurchase = () => openEditor({ type: 'expense', accountId: account.id });
  const addFee = () =>
    openEditor({ type: 'expense', accountId: account.id, categoryId: expenseCats?.find((c) => c.key === 'bills')?.id, note: t('cards.feeNote') });

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
        <div className="b-card b-cc">
          <div className="b-cc__label">{t('cards.owedNowTitle')}</div>
          <div className={`b-cc__big b-num ${used > 0 ? 'b-expense' : ''}`}>{lines((x) => x.owed)}</div>
          {limit ? (
            <>
              <div className="b-bar" style={{ margin: '12px 0 8px' }}>
                <span
                  style={{
                    width: `${Math.min(100, share * 100)}%`,
                    background: share >= NEAR_LIMIT ? 'var(--b-expense)' : 'var(--ion-color-primary)',
                  }}
                />
              </div>
              <div className="b-cc__split b-num">
                <span className={used > limit ? 'b-expense' : ''}>
                  {used > limit
                    ? t('cards.overLimit', { amount: money.format(used - limit, main) })
                    : t('cards.available', { amount: money.format(limit - used, main) })}
                </span>
                <span className="b-muted">{t('cards.limitOf', { amount: money.format(limit, main) })}</span>
              </div>
            </>
          ) : null}
        </div>

        <div className="b-section-title">{t('cards.statementOf', { date: dayMonth(status.cycle.statementOn) })}</div>
        <div className="b-card b-cc">
          <CcRow label={t('cards.statementBalance')}>{lines((x) => x.statement)}</CcRow>
          <CcRow label={t('cards.paidSince')}>{lines((x) => x.paid)}</CcRow>
          <CcRow label={t('cards.leftToPay')} strong>{lines((x) => x.due)}</CcRow>
          {hasMinimum && <CcRow label={t('cards.minimumLeft')}>{lines((x) => x.minimum)}</CcRow>}
          <DueLine status={status} />
          <div className="b-muted b-cc__next">{t('cards.nextStatement', { date: dayMonth(status.cycle.nextStatementOn) })}</div>
        </div>

        <div className="b-cc__actions">
          {hasMinimum && (own.minimum ?? 0) > 0 && (own.minimum ?? 0) < own.due && (
            <button className="b-btn b-btn--muted" onClick={act(() => pay(own.minimum))}>
              <IonIcon icon={swapHorizontalOutline} />
              {t('cards.payMinimum')}
            </button>
          )}
          <button className="b-btn b-btn--muted" onClick={act(addFee)}>
            <IonIcon icon={receiptOutline} />
            {t('cards.addFee')}
          </button>
        </div>
        <p className="b-muted b-hint">{t('cards.hint')}</p>
      </div>

      <div className="b-sheet__foot">
        <button className="b-btn b-btn--muted" onClick={act(addPurchase)}>
          <IonIcon icon={addOutline} />
          {t('cards.addPurchase')}
        </button>
        <button className="b-btn b-btn--primary" onClick={act(() => pay(own.due || undefined))}>
          <IonIcon icon={swapHorizontalOutline} />
          {own.due ? t('cards.payAmount', { amount: money.format(own.due, main) }) : t('cards.pay')}
        </button>
      </div>
    </div>
  );
}

/** Formats a date as "25 Oct" in the app's language. */
function useDayMonth(): (d: Date) => string {
  const locale = useLocale();
  return (d) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(d);
}

function CcRow({ label, strong, children }: { label: string; strong?: boolean; children: ReactNode }) {
  return (
    <div className={`b-cc__row ${strong ? 'is-strong' : ''}`}>
      <span>{label}</span>
      <span className="b-num">{children}</span>
    </div>
  );
}

/** When the statement is due, or that it's paid. */
function DueLine({ status }: { status: CardStatus }) {
  const { t } = useTranslation();
  const date = useDayMonth()(status.cycle.dueOn);
  const { state, daysLeft } = status;
  const [text, tone] =
    state === 'overdue' ? [t('cards.overdue', { count: -daysLeft, date }), 'b-expense']
    : state === 'due' ? [daysLeft === 0 ? t('cards.dueToday') : t('cards.dueIn', { count: daysLeft, date }), daysLeft <= REMIND_DAYS ? 'b-warn' : '']
    : state === 'paid' ? [t('cards.paid'), 'b-income']
    : [t('cards.clear'), 'b-muted'];
  return <div className={`b-cc__due ${tone}`}>{text}</div>;
}
