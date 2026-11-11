import { Fragment, useState, type ReactNode } from 'react';
import { IonButtons, IonIcon, IonMenuToggle, IonTitle, IonToolbar, useIonRouter } from '@ionic/react';
import { warningOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { useAccountFilter } from '@/core/contexts/AccountFilterContext';
import { useConverter, useMoney, useSettings } from '@/core/contexts/SettingsContext';
import { useAccounts, useBalances, useCurrenciesInUse, useNames } from '@/core/db/hooks';
import { addAmounts, headerCurrencies } from '@/core/utils/currency';
import AccountsFilterSheet from '@/features/accounts/AccountsFilterSheet';
import { usePendingCount } from '@/features/sms/hooks';
import { useSmsAvailable } from '@/features/sms/useSmsAvailable';
import MoneyText from './MoneyText';
import ProfileAvatar from './ProfileAvatar';

/**
 * Top bar of the main tabs: the menu button, the balance of the accounts picked in the
 * filter ("Accounts • 2 · EGP 12,164" — tap it to change the filter) and a page action. With just one
 * account picked, it shows that account's balance in its own currency ("USD 120"), or both for an
 * account with two ("EGP 5,000 · USD 120"). Several accounts with a two-currency one among them show
 * every currency they hold, each added up and not converted ("EGP 12,164 · USD 120").
 */
export default function AppHeader({ end }: { end?: ReactNode }) {
  const { t } = useTranslation();
  const money = useMoney();
  const conv = useConverter();
  const { accountName } = useNames();
  const { inTotal } = useAccountFilter();
  const accounts = useAccounts();
  const balances = useBalances();
  const inUse = useCurrenciesInUse();
  const router = useIonRouter();
  const [filterOpen, setFilterOpen] = useState(false);
  const { smsImport } = useSettings();
  const smsAvailable = useSmsAvailable();
  const pendingTexts = usePendingCount();
  // A dot on the avatar while bank texts wait for review (shown when the menu lists Bank texts).
  const textsWaiting = smsAvailable && smsImport.enabled && pendingTexts > 0;

  const chosen = (accounts ?? []).filter((a) => inTotal.has(a.id!));
  const amounts = addAmounts(chosen.map((a) => balances?.get(a.id!)));
  const total = conv.sum(amounts);
  const label = chosen.length === 1 ? accountName(chosen[0]) : t('header.accounts', { count: chosen.length });
  // One account, or several with a two-currency one: the balance in each currency, not converted to the main one.
  const ownCurrencies = headerCurrencies(chosen, conv.base);
  // Amounts in these currencies count as 0 in every total until a rate is set.
  const missing = (inUse ?? []).filter((c) => conv.rate(c) == null).sort();

  return (
    <>
    <IonToolbar className="b-toolbar b-apphead">
      <IonButtons slot="start">
        <IonMenuToggle autoHide={false}>
          <button className="b-apphead__me" aria-label={t('menu.open')}>
            <span className="b-apphead__avatar">
              <ProfileAvatar size={32} outlined />
              {textsWaiting && <span className="b-apphead__dot" aria-hidden="true" />}
            </span>
          </button>
        </IonMenuToggle>
      </IonButtons>
      <IonTitle>
        <button className="b-apphead__balance" onClick={() => setFilterOpen(true)} aria-label={t('filter.title')}>
          <small>{label}</small>
          {ownCurrencies ? (
            <span className={`b-num ${ownCurrencies.length > 1 ? 'b-apphead__dual' : ''}`}>
              {ownCurrencies.map((c, i) => (
                <Fragment key={c}>
                  {i > 0 && ' · '}
                  <span className={(amounts[c] ?? 0) < 0 ? 'b-expense' : ''}>
                    <MoneyText currency={c} text={money.plain(amounts[c] ?? 0, c)} />
                  </span>
                </Fragment>
              ))}
            </span>
          ) : (
            <span className={`b-num ${total.value < 0 ? 'b-expense' : ''}`}>
              <MoneyText currency={conv.base} text={money.plain(total.value)} />
            </span>
          )}
        </button>
      </IonTitle>
      <IonButtons slot="end">{end}</IonButtons>
      <AccountsFilterSheet isOpen={filterOpen} onClose={() => setFilterOpen(false)} />
    </IonToolbar>
    {missing.length > 0 && (
      <IonToolbar className="b-toolbar">
        <button className="b-ratewarn" onClick={() => router.push('/settings')}>
          <IonIcon icon={warningOutline} />
          {t('accounts.missingRates', { list: missing.join(', ') })}
        </button>
      </IonToolbar>
    )}
    </>
  );
}
