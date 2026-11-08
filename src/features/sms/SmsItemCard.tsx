import { useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { IonIcon, useIonToast } from '@ionic/react';
import { useTranslation } from 'react-i18next';
import { useConverter, useLocale, useMoney } from '@/core/contexts/SettingsContext';
import { useTxEditor } from '@/core/contexts/TxEditorContext';
import { useNames } from '@/core/db/hooks';
import { currenciesOf } from '@/core/utils/currency';
import { dayTimeLabel } from '@/core/utils/period';
import { buildTxRecord } from '@/features/transactions/txRecord';
import { iconFor } from '@/shared/icons';
import type { Account, Category, SmsPending } from '@/shared/models';
import { flowOf, importText, resolveImported, resolveSkipped, type Suggestion } from './learning';
import { cardDraft } from './review';
import { useDuplicatePrompt } from './useDuplicatePrompt';

interface Props {
  item: SmsPending;
  /** The suggestion with the user's picks on top. */
  choice: Suggestion;
  account?: Account;
  category?: Category;
  onPickAccount(): void;
  onPickCategory(): void;
}

/** Stops a button's tap from also opening the editor (which a tap anywhere else on the card does). */
const only = (fn: () => void) => (e: MouseEvent) => {
  e.stopPropagation();
  fn();
};

/** One bank text on the review screen: confirm or dismiss it here, or tap it to open the editor pre-filled. */
export default function SmsItemCard({ item, choice, account, category, onPickAccount, onPickCategory }: Props) {
  const { t } = useTranslation();
  const locale = useLocale();
  const money = useMoney();
  const conv = useConverter();
  const openEditor = useTxEditor();
  const askDuplicate = useDuplicatePrompt();
  const { accountName, categoryName } = useNames();
  const [busy, setBusy] = useState(false);
  const [presentToast] = useIonToast();
  const failed = () => void presentToast({ message: t('sms.actionFailed'), duration: 3000, position: 'top', color: 'danger' });

  const when = dayTimeLabel(new Date(item.date), locale, { today: t('period.today'), yesterday: t('period.yesterday') });
  const sender = item.digits ? `${item.address} · ••${item.digits}` : item.address;
  const understood = item.status === 'understood';
  const draft = cardDraft(item, choice, conv);
  // A USD text on an EGP card still saves in USD; the card says so before Confirm.
  const held = account ? currenciesOf(account) : [];
  const notHeld = understood && account != null && item.currency != null && !held.includes(item.currency);

  /** Runs one action at a time; the card goes away once the text is resolved, and stays (with a toast) if it fails. */
  const run = (fn: () => Promise<void>) => async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch {
      failed();
    } finally {
      setBusy(false);
    }
  };

  const confirm = run(async () => {
    if (!draft) return;
    const answer = await askDuplicate(draft);
    if (answer === 'cancel') return;
    if (answer === 'skip') return resolveSkipped(item, 'duplicate');
    await importText(item, buildTxRecord(draft));
  });

  const dismiss = run(() => resolveSkipped(item, 'dismissed'));

  const edit = () => {
    if (busy) return;
    openEditor({
      type: flowOf(item),
      amount: item.amount,
      currency: item.currency,
      date: item.date,
      note: item.merchant,
      accountId: choice.accountId,
      categoryId: choice.categoryId,
      smsFingerprint: item.fingerprint,
      header: (
        <div className="b-smshead">
          <div className="b-smscard__top">
            <span>{item.address}</span>
            <span>{when}</span>
          </div>
          <p dir="auto">{item.body}</p>
        </div>
      ),
      // The transaction is saved by then; trying again from the card won't save it twice.
      onSaved: (tx) => void resolveImported(item, tx).catch(failed),
      onSkipped: () => void resolveSkipped(item, 'duplicate').catch(failed),
    });
  };

  const chip = (label: string, picked: { name: string; icon: string; color: string } | undefined, onClick: () => void): ReactNode => (
    <button
      className={`b-smschip ${picked ? 'is-set' : 'is-empty'}`}
      style={picked ? ({ '--c': picked.color } as CSSProperties) : undefined}
      onClick={only(onClick)}
      disabled={busy}
    >
      {picked && <IonIcon icon={iconFor(picked.icon)} />}
      {picked ? picked.name : label}
    </button>
  );

  const incoming = item.direction === 'in';

  return (
    <div className={`b-card b-smscard ${busy ? 'is-busy' : ''}`} onClick={edit}>
      {/* The tappable summary; the click reaches the card's handler. */}
      <button type="button" className="b-smscard__main">
        <span className="b-smscard__top">
          <span>{sender}</span>
          <span>{when}</span>
        </span>
        {understood && item.amount != null && item.currency && (
          <span className={`b-smscard__amt b-num ${incoming ? 'b-income' : 'b-expense'}`} dir="ltr">
            {incoming ? '+' : '−'} {money.plain(item.amount, item.currency)} {item.currency}
          </span>
        )}
        {understood && item.merchant && <span className="b-smscard__merchant">{item.merchant}</span>}
      </button>

      {understood ? (
        <>
          <div className="b-smscard__chips">
            {chip(t('sms.pickAccount'), account && { name: accountName(account), icon: account.icon, color: account.color }, onPickAccount)}
            {chip(t('sms.pickCategory'), category && { name: categoryName(category), icon: category.icon, color: category.color }, onPickCategory)}
          </div>
          {notHeld && (
            <p className="b-smscard__note">
              {t('sms.savedInCurrency', { currency: item.currency, account: accountName(account), held: held.join(' / ') })}
            </p>
          )}
        </>
      ) : (
        <>
          <div className="b-smscard__warn">{t('sms.couldntRead')}</div>
          <p className="b-smscard__raw" dir="auto">{item.body}</p>
        </>
      )}

      <div className="b-smscard__btns">
        <button className="b-btn b-btn--muted" onClick={only(() => void dismiss())} disabled={busy}>
          {t('sms.dismiss')}
        </button>
        {understood ? (
          <button className="b-btn b-btn--primary" onClick={only(() => void confirm())} disabled={busy || !draft}>
            {t('sms.confirm')}
          </button>
        ) : (
          <button className="b-btn b-btn--primary" onClick={only(edit)} disabled={busy}>
            {t('sms.fillIn')}
          </button>
        )}
      </div>
    </div>
  );
}
