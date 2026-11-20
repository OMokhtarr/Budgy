import {
  IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonPage, IonTitle, IonToolbar,
} from '@ionic/react';
import { addOutline, flashOutline, repeatOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { useLocale } from '@/core/contexts/SettingsContext';
import { useLookups } from '@/core/db/hooks';
import { parseDayKey } from '@/core/utils/period';
import { repeatOf } from '@/core/utils/recurring';
import { useRevealWhen } from '@/shared/splash';
import Avatar from '@/shared/components/Avatar';
import type { Recurring } from '@/shared/models';
import { skipOccurrence } from './actions';
import { useDue, useRecurring, useRecurringLabel } from './hooks';
import { useOpenRecurring } from './useOpenRecurring';

/** Menu → Recurring: the ones due first (add or skip), then every recurring transaction. */
export default function RecurringPage() {
  const { t } = useTranslation();
  const locale = useLocale();
  useRevealWhen(true);
  const all = useRecurring();
  const due = useDue();
  const label = useRecurringLabel();
  const { categories } = useLookups();
  const { openRule, openNew, openDue } = useOpenRecurring();
  const day = (key: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(parseDayKey(key));
  const shortDay = (key: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(parseDayKey(key));

  const avatar = (r: Recurring) => {
    if (r.tx.type === 'transfer') return <Avatar icon="transfer" color="var(--b-transfer)" />;
    const cat = categories.get(r.tx.categoryId ?? '');
    return <Avatar icon={cat?.icon ?? 'other'} color={cat?.color ?? '#64748b'} />;
  };
  const amountClass = (r: Recurring) =>
    r.tx.type === 'transfer' ? 'b-transfer' : r.tx.type === 'expense' || r.tx.moneyBack ? 'b-expense' : 'b-income';

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar className="b-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/categories" text="" />
          </IonButtons>
          <IonTitle className="b-title">{t('recurring.title')}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={openNew} aria-label={t('recurring.add')}>
              <IonIcon slot="icon-only" icon={addOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {all && due && (
          <div className="b-page">
            {due.length > 0 && (
              <>
                <div className="b-section-title">{t('recurring.dueTitle')}</div>
                <div className="b-card b-rlist">
                  {due.map(({ r, days }) => {
                    const { name, amount } = label(r);
                    return (
                      <div key={r.id} className="b-row b-rdue">
                        {avatar(r)}
                        <div className="b-row__main">
                          <div className="b-row__title">{name}</div>
                          <div className="b-row__sub">
                            <span className={`b-num ${amountClass(r)}`}>{amount}</span>
                            <span>· {t('recurring.dueCount', { count: days.length, date: shortDay(days[0]) })}</span>
                          </div>
                        </div>
                        <div className="b-rdue__actions">
                          <IonButton size="small" fill="clear" color="medium" onClick={() => void skipOccurrence(r, days[0])}>
                            {t('recurring.skip')}
                          </IonButton>
                          <IonButton size="small" onClick={() => openDue(r, days[0])}>
                            {t('recurring.addOne')}
                          </IonButton>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {all.length === 0 ? (
              <div className="b-empty">
                <IonIcon icon={repeatOutline} />
                <p>{t('recurring.empty')}</p>
              </div>
            ) : (
              <>
                <div className="b-section-title">{t('recurring.allTitle')}</div>
                <div className="b-card b-rlist">
                  {all.map((r) => {
                    const { name, amount } = label(r);
                    return (
                      <button key={r.id} className="b-row" onClick={() => openRule(r)}>
                        {avatar(r)}
                        <div className="b-row__main">
                          <div className="b-row__title">
                            {name}
                            {r.auto && <IonIcon className="b-row__link" icon={flashOutline} aria-label={t('recurring.auto')} />}
                          </div>
                          <div className="b-row__sub">
                            <span>{t(`recurring.every.${repeatOf(r)}`)} · {t('recurring.next', { date: day(r.next) })}</span>
                          </div>
                        </div>
                        <div className={`b-row__amount b-num ${amountClass(r)}`}>{amount}</div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            <p className="b-rhint">{t('recurring.hint')}</p>
          </div>
        )}
      </IonContent>
    </IonPage>
  );
}
