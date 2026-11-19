import { useState } from 'react';
import { IonIcon, IonSpinner, useIonToast } from '@ionic/react';
import { alertCircleOutline, copyOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { useCloud } from '@/core/cloud/CloudContext';
import { useLocale } from '@/core/contexts/SettingsContext';
import { usePro } from '@/core/pro/ProContext';
import { usePaywall } from '@/core/pro/useRequirePro';

/** "abcd1234…wxyz": enough for support to find the account without showing the whole id. */
const shortId = (id: string) => (id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id);

/**
 * Profile → "Budgy Pro": the pitch with Get Pro / Restore for a free user, the plan and Manage for a subscriber,
 * and the Support ID either way. The caller renders it only when Budgy Pro is available in this build.
 */
export default function ProSection() {
  const { t } = useTranslation();
  const locale = useLocale();
  const cloud = useCloud();
  const pro = usePro();
  const paywall = usePaywall();
  const [presentToast] = useIonToast();
  const [busy, setBusy] = useState(false);

  const toast = (message: string, color = 'medium') => presentToast({ message, duration: 3000, position: 'top', color });
  const withBusy = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  // The paywall itself, also in 'test' mode where nothing is gated; it toasts a failure.
  const getPro = () =>
    withBusy(async () => {
      await paywall();
    });

  const restore = () =>
    withBusy(async () => {
      try {
        const found = await pro.restore();
        toast(t(found ? 'pro.restored' : 'pro.restoredNone'), found ? 'success' : 'medium');
      } catch (err) {
        console.warn('Budgy: restore', err);
        toast(t('cloud.actionFailed'), 'danger');
      }
    });

  const manage = () =>
    withBusy(async () => {
      try {
        await pro.showCustomerCenter();
      } catch (err) {
        console.warn('Budgy: customer center', err);
        toast(t('cloud.actionFailed'), 'danger');
      }
    });

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      void toast(t('pro.copied'));
    } catch (err) {
      console.warn('Budgy: copy', err);
    }
  };

  const { plan } = pro;
  const date = (iso: string) => new Date(iso).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
  const planName = plan && plan.period !== 'other' ? t(`pro.${plan.period}`) : null;
  const dateLine =
    plan && plan.period !== 'lifetime' && plan.endsAt ? t(plan.willRenew ? 'pro.renewsOn' : 'pro.endsOn', { date: date(plan.endsAt) }) : null;

  return (
    <>
      <div className="b-section-title">{t('pro.title')}</div>
      <div className="b-card" style={{ padding: 14 }}>
        {!pro.ready ? (
          // Neither the pitch nor the plan until RevenueCat has answered, so a subscriber never sees "Get Pro" flash.
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <IonSpinner name="dots" />
          </div>
        ) : pro.isPro ? (
          <>
            {(planName || plan?.trial) && (
              <div style={{ fontWeight: 600 }}>
                {planName}
                {plan?.trial && <span className="b-muted" style={{ fontWeight: 400 }}>{planName ? ` · ${t('pro.trial')}` : t('pro.trial')}</span>}
              </div>
            )}
            {dateLine && <div className="b-muted" style={{ marginTop: 4, fontSize: 13.5 }}>{dateLine}</div>}
            {plan?.billingIssue && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8, fontSize: 13.5, color: 'var(--b-expense)' }}>
                <IonIcon icon={alertCircleOutline} style={{ flexShrink: 0, marginTop: 2 }} />
                {t('pro.billingIssue')}
              </div>
            )}
            <button className="b-btn b-btn--muted" style={{ width: '100%', marginTop: 12 }} disabled={busy} onClick={() => void manage()}>
              {t('pro.manage')}
            </button>
          </>
        ) : (
          <>
            <p className="b-muted" style={{ margin: '0 0 12px', fontSize: 13.5, lineHeight: 1.5 }}>{t('pro.pitch')}</p>
            <button className="b-btn b-btn--primary" style={{ width: '100%' }} disabled={busy} onClick={() => void getPro()}>
              {t('pro.get')}
            </button>
            <button className="b-btn b-btn--muted" style={{ width: '100%', marginTop: 8 }} disabled={busy} onClick={() => void restore()}>
              {t('pro.restore')}
            </button>
            {pro.gateOn && cloud.enabled && !cloud.user && (
              <p className="b-muted" style={{ margin: '12px 0 0', fontSize: 13, lineHeight: 1.5 }}>{t('cloud.alreadyPro')}</p>
            )}
          </>
        )}
        {pro.appUserId && (
          <button
            className="b-muted"
            style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '14px 0 0', padding: 0, border: 'none', background: 'none', font: 'inherit', fontSize: 13 }}
            onClick={() => void copyId(pro.appUserId as string)}
          >
            {t('pro.supportId')}: <bdi dir="ltr">{shortId(pro.appUserId)}</bdi>
            <IonIcon icon={copyOutline} />
          </button>
        )}
      </div>
    </>
  );
}
