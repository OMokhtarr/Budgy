import { useState } from 'react';
import {
  IonBackButton, IonButtons, IonContent, IonHeader, IonItem, IonLabel, IonList, IonListHeader, IonNote, IonPage,
  IonSelect, IonSelectOption, IonTitle, IonToolbar, useIonAlert,
} from '@ionic/react';
import { useTranslation } from 'react-i18next';
import { version } from '../../../package.json';
import { CURRENCIES, rebaseRates, useSettings, type ThemePref } from '@/core/contexts/SettingsContext';
import { db, moveAccountsToCurrency, unusedAccountsIn } from '@/core/db/db';
import { useAccounts, useCategories, useCurrenciesInUse } from '@/core/db/hooks';
import { currenciesOf, roundTo } from '@/core/utils/currency';
import { parseNumber } from '@/core/utils/number';
import RateInput from '@/shared/components/RateInput';
import { useCloud } from '@/core/cloud/CloudContext';
import SmsSettingsSection from '@/features/sms/SmsSettingsSection';
import { useSmsAvailable } from '@/features/sms/useSmsAvailable';

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const settings = useSettings();
  const { user } = useCloud();
  const smsAvailable = useSmsAvailable();
  const accounts = useAccounts(true);
  const categories = useCategories(undefined, true);
  const inUse = useCurrenciesInUse();
  const [presentAlert] = useIonAlert();
  // Remounts the currency select so it shows the saved currency again after a cancelled change.
  const [currencyKey, setCurrencyKey] = useState(0);
  // Every currency an account or transaction uses, other than the main one, needs a rate for totals.
  const foreign = [...new Set([...(accounts ?? []).flatMap(currenciesOf), ...(inUse ?? [])])]
    .filter((c) => c !== settings.currency)
    .sort();

  /**
   * Switches the main currency; `pivot` (units of the old currency per one of the new) converts rates
   * and budgets, and `unused` accounts (never held money, e.g. the starting ones) move to the new currency.
   */
  const applyCurrency = async (next: string, pivot: number | undefined, unused: string[]) => {
    if (pivot) {
      settings.update({ currency: next, rates: rebaseRates({ ...settings.rates, [next]: pivot }, settings.currency, next) });
      await db.categories.toCollection().modify((c) => {
        if (c.budget) c.budget = roundTo(c.budget / pivot, next);
      });
    } else {
      settings.update({ currency: next });
    }
    if (unused.length) await moveAccountsToCurrency(unused, next);
  };

  const changeCurrency = async (next: string) => {
    const from = settings.currency;
    if (next === from) return;
    const unused = await unusedAccountsIn(from);
    const known = settings.rates[next];
    const needsRate = Object.keys(settings.rates).length > 0 || (categories ?? []).some((c) => c.budget);
    const revert = () => setCurrencyKey((k) => k + 1);
    const moves = unused.length ? ` ${t('settings.currencyMovesAccounts', { count: unused.length, from, to: next })}` : '';
    if (known || !needsRate) {
      // Totals change meaning (and budgets get converted), so confirm even when nothing needs typing.
      presentAlert({
        header: t('settings.currencyConfirmTitle', { currency: next }),
        message:
          (known
            ? t('settings.currencyConfirmConvert', { from, to: next, rate: known })
            : t('settings.currencyConfirmMessage', { currency: next })) + moves,
        backdropDismiss: false,
        buttons: [
          { text: t('common.cancel'), role: 'cancel', handler: revert },
          { text: t('settings.currencySwitch'), handler: () => void applyCurrency(next, known, unused) },
        ],
      });
      return;
    }
    // Without a rate for the new currency the existing rates and budgets can't be carried over, so ask for it.
    presentAlert({
      header: t('settings.currencyRateTitle', { currency: next }),
      message: t('settings.currencyRateMessage', { from, to: next }) + moves,
      backdropDismiss: false,
      inputs: [{ name: 'rate', type: 'text', placeholder: `1 ${next} = ? ${from}`, attributes: { inputmode: 'decimal' } }],
      buttons: [
        { text: t('common.cancel'), role: 'cancel', handler: revert },
        {
          text: t('common.save'),
          handler: (data: { rate?: string }) => {
            const rate = parseNumber(data.rate ?? '');
            if (!(rate > 0)) return false;
            void applyCurrency(next, rate, unused);
          },
        },
      ],
    });
  };

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar className="b-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/categories" text="" />
          </IonButtons>
          <IonTitle className="b-title">{t('tabs.settings')}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <div className="b-page" style={{ paddingInline: 0 }}>
          <IonList inset>
            <IonListHeader>{t('settings.general')}</IonListHeader>
            <IonItem>
              <IonSelect
                key={currencyKey}
                label={t('settings.currency')}
                value={settings.currency}
                interface="action-sheet"
                onIonChange={(e) => void changeCurrency(e.detail.value)}
              >
                {CURRENCIES.map((c) => (
                  <IonSelectOption key={c} value={c}>{c}</IonSelectOption>
                ))}
              </IonSelect>
            </IonItem>
            <IonItem>
              <IonSelect
                label={t('settings.language')}
                value={i18n.language}
                interface="action-sheet"
                onIonChange={(e) => i18n.changeLanguage(e.detail.value)}
              >
                <IonSelectOption value="en">English</IonSelectOption>
                <IonSelectOption value="ar">العربية</IonSelectOption>
              </IonSelect>
            </IonItem>
            <IonItem>
              <IonSelect
                label={t('settings.theme')}
                value={settings.theme}
                interface="action-sheet"
                onIonChange={(e) => settings.update({ theme: e.detail.value as ThemePref })}
              >
                <IonSelectOption value="system">{t('settings.themeSystem')}</IonSelectOption>
                <IonSelectOption value="light">{t('settings.themeLight')}</IonSelectOption>
                <IonSelectOption value="dark">{t('settings.themeDark')}</IonSelectOption>
              </IonSelect>
            </IonItem>
            <IonItem>
              <IonSelect
                label={t('settings.weekStart')}
                value={settings.weekStart}
                interface="action-sheet"
                onIonChange={(e) => settings.update({ weekStart: Number(e.detail.value) })}
              >
                <IonSelectOption value={6}>{t('settings.saturday')}</IonSelectOption>
                <IonSelectOption value={0}>{t('settings.sunday')}</IonSelectOption>
                <IonSelectOption value={1}>{t('settings.monday')}</IonSelectOption>
              </IonSelect>
            </IonItem>
          </IonList>

          {smsAvailable && <SmsSettingsSection />}

          {foreign.length > 0 && (
            <IonList inset>
              <IonListHeader>{t('settings.rates')}</IonListHeader>
              {foreign.map((c) => (
                <IonItem key={`${settings.currency}-${c}`}>
                  <RateInput currency={c} />
                </IonItem>
              ))}
              <IonItem lines="none">
                <IonNote style={{ fontSize: 12.5, padding: '8px 0' }}>{t('settings.ratesHint', { currency: settings.currency })}</IonNote>
              </IonItem>
            </IonList>
          )}

          <IonList inset>
            <IonItem lines="none">
              <IonLabel>
                Budgy
                <p>{t(user ? 'settings.aboutSynced' : 'settings.about')}</p>
              </IonLabel>
              <IonNote slot="end">v{version}</IonNote>
            </IonItem>
          </IonList>
        </div>
      </IonContent>
    </IonPage>
  );
}
