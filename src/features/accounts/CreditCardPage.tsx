import { useMemo, useState } from 'react';
import {
  IonBackButton, IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonPage, IonTitle, IonToolbar,
} from '@ionic/react';
import { addOutline, chevronDownOutline, chevronForwardOutline, createOutline, receiptOutline, swapHorizontalOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { Redirect, useLocation, useParams } from 'react-router-dom';
import { useMoney } from '@/core/contexts/SettingsContext';
import { useTxEditor } from '@/core/contexts/TxEditorContext';
import { useAccounts, useCardTransactions, useLookups, useNames } from '@/core/db/hooks';
import { cardStatus, cardTransactions, interestFree, isCreditCard, type CardStatus } from '@/core/utils/creditCard';
import { changeOn } from '@/core/utils/lending';
import Avatar from '@/shared/components/Avatar';
import { useRevealWhen } from '@/shared/splash';
import MoneyText from '@/shared/components/MoneyText';
import type { Account, CreditCard, Transaction } from '@/shared/models';
import AccountEditModal from './AccountEditModal';
import { CcRow, CycleRows, OwedBlock, StatementRows, useCycleTitle, useDayMonth } from './card/CardBlocks';
import { useCardActions } from './card/useCardActions';

/** Everything about one credit card: what's owed, the last statement, this cycle, interest-free days and its transactions. */
export default function CreditCardPage() {
  const { id } = useParams<{ id: string }>();
  const { pathname } = useLocation();
  const accounts = useAccounts();
  const txs = useCardTransactions(id);
  const account = accounts?.find((a) => a.id === id);
  const card = account && isCreditCard(account) ? account : undefined;
  // Worked out from the same account the page shows, so a currency just added in Edit is always in it.
  const status = useMemo(() => (card && txs ? cardStatus(card, txs, new Date()) : undefined), [card, txs]);
  // When the app opens straight onto this page, the launch screen goes once there's something to show.
  useRevealWhen(!!accounts && (!card || !!status));
  // A card that was deleted, archived or turned back into a debit card has nothing to show here. Ionic keeps
  // this page mounted under other tabs, so it only sends the user away while it's the page on screen.
  if (accounts && !card) return pathname === `/cards/${id}` ? <Redirect to="/accounts" /> : <IonPage />;
  return <IonPage>{card && status && txs ? <CardPage account={card} status={status} txs={txs} /> : null}</IonPage>;
}

function CardPage({ account, status, txs }: { account: Account & { credit: CreditCard }; status: CardStatus; txs: Transaction[] }) {
  const { t } = useTranslation();
  const money = useMoney();
  const { accountName } = useNames();
  const dayMonth = useDayMonth();
  const cycleTitle = useCycleTitle();
  const actions = useCardActions(account, status);
  const [editing, setEditing] = useState(false);
  const [showEarlier, setShowEarlier] = useState(false);
  const { thisCycle, lastCycle } = useMemo(() => cardTransactions(account.id!, txs, status.cycle), [account.id, txs, status.cycle]);
  const free = interestFree(account.credit, new Date());
  const own = status.byCurrency[account.currency];

  return (
    <>
      <IonHeader className="ion-no-border">
        <IonToolbar className="b-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/accounts" text="" />
          </IonButtons>
          <IonTitle className="b-title">{accountName(account)}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={() => setEditing(true)} aria-label={t('cards.edit')}>
              <IonIcon slot="icon-only" icon={createOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <div className="b-page">
          <OwedBlock account={account} status={status} />

          <div className="b-section-title">{t('cards.statementOf', { date: dayMonth(status.cycle.statementOn) })}</div>
          <div className="b-card b-cc">
            <StatementRows account={account} status={status} />
          </div>

          <div className="b-section-title">{cycleTitle(status)}</div>
          <div className="b-card b-cc b-cc--flat">
            <CycleRows account={account} status={status} />
          </div>

          <div className="b-section-title">{t('cards.interestFreeTitle')}</div>
          <div className="b-card b-cc">
            <CcRow label={t('cards.buyToday', { date: dayMonth(free.today.payBy) })}>{t('cards.days', { count: free.today.days })}</CcRow>
            <CcRow label={t('cards.bestDay', { date: dayMonth(free.best.buyOn) })} strong>
              {t('cards.days', { count: free.best.days })}
            </CcRow>
            <div className="b-muted b-cc__next">{t('cards.interestFreeNote')}</div>
          </div>

          <div className="b-section-title">{t('cards.txThisCycle')}</div>
          <div className="b-card b-rlist">
            {thisCycle.length ? thisCycle.map((x) => <CardTxRow key={x.id} tx={x} cardId={account.id!} />) : (
              <div className="b-cc__empty">{t('cards.noTx')}</div>
            )}
            {lastCycle.length > 0 && (
              <button className="b-row" onClick={() => setShowEarlier((v) => !v)} aria-expanded={showEarlier}>
                <div className="b-row__main">
                  <div className="b-row__title">{t('cards.txEarlier', { date: dayMonth(status.cycle.statementOn) })}</div>
                </div>
                <IonIcon icon={showEarlier ? chevronDownOutline : chevronForwardOutline} className="b-flip" />
              </button>
            )}
            {showEarlier && lastCycle.map((x) => <CardTxRow key={x.id} tx={x} cardId={account.id!} />)}
          </div>

          <div className="b-cc__actions">
            {actions.payMinimum && (
              <button className="b-btn b-btn--muted" onClick={actions.payMinimum}>
                <IonIcon icon={swapHorizontalOutline} />
                {t('cards.payMinimum')}
              </button>
            )}
            <button className="b-btn b-btn--muted" onClick={actions.addFee}>
              <IonIcon icon={receiptOutline} />
              {t('cards.addFee')}
            </button>
          </div>
          <p className="b-muted b-hint">{t('cards.hint')}</p>
        </div>
      </IonContent>
      <IonFooter className="ion-no-border">
        <div className="b-sheet__foot">
          <button className="b-btn b-btn--muted" onClick={actions.addPurchase}>
            <IonIcon icon={addOutline} />
            {t('cards.addPurchase')}
          </button>
          <button className="b-btn b-btn--primary" onClick={() => actions.pay(own.due || undefined)}>
            <IonIcon icon={swapHorizontalOutline} />
            {own.due ? t('cards.payAmount', { amount: money.format(own.due, account.currency) }) : t('cards.pay')}
          </button>
        </div>
      </IonFooter>
      <AccountEditModal isOpen={editing} account={account} onClose={() => setEditing(false)} />
    </>
  );
}

/** A transaction as the card sees it: what it is, when, and the money in or out of the card. */
function CardTxRow({ tx, cardId }: { tx: Transaction; cardId: string }) {
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
  return (
    <button className="b-row" onClick={() => openEditor({ tx })}>
      {transfer ? <Avatar icon="transfer" color="var(--b-transfer)" /> : <Avatar icon={cat?.icon ?? 'other'} color={cat?.color ?? '#64748b'} />}
      <div className="b-row__main">
        <div className="b-row__title">{title}</div>
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
