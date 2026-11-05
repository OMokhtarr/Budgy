import { Fragment, useState, type ReactNode } from 'react';
import { IonButtons, IonIcon, IonMenuToggle, IonTitle, IonToolbar, useIonRouter } from '@ionic/react';
import { warningOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { useAccountFilter } from '@/core/contexts/AccountFilterContext';
import { useConverter, useMoney } from '@/core/contexts/SettingsContext';
import { useAccounts, useBalances, useCurrenciesInUse, useNames } from '@/core/db/hooks';
import { addAmounts, currenciesOf } from '@/core/utils/currency';
import AccountsFilterSheet from '@/features/accounts/AccountsFilterSheet';
import MoneyText from './MoneyText';
import ProfileAvatar from './ProfileAvatar';

/**
 * Top bar of the main tabs: the menu button, the balance of the accounts picked in the
 * filter ("Accounts • 2 · EGP 12,164" — tap it to change the filter) and a page action. With just one
 * account picked, it shows that account's balance in its own currency ("USD 120"), or both for an
 * account with two ("EGP 5,000 · USD 120").
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

  const chosen = (accounts ?? []).filter((a) => inTotal.has(a.id!));
  const total = conv.sum(addAmounts(chosen.map((a) => balances?.get(a.id!))));
  const label = chosen.length === 1 ? accountName(chosen[0]) : t('header.accounts', { count: chosen.length });
  // One account: its balance in its own currencies, not converted to the main one.
  const ownCurrencies = chosen.length === 1 ? currenciesOf(chosen[0]) : undefined;
  const own = ownCurrencies && balances?.get(chosen[0].id!);
  // Amounts in these currencies count as 0 in every total until a rate is set.
  const missing = (inUse ?? []).filter((c) => conv.rate(c) == null).sort();

  return (
    <>
    <IonToolbar className="b-toolbar b-apphead">
      <IonButtons slot="start">
        <IonMenuToggle autoHide={false}>
          <button className="b-apphead__me" aria-label={t('menu.open')}>
            <ProfileAvatar size={32} outlined />
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
                  <span className={(own?.[c] ?? 0) < 0 ? 'b-expense' : ''}>
                    <MoneyText currency={c} text={money.plain(own?.[c] ?? 0, c)} />
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
