import { useEffect, useState } from 'react';
import { IonIcon, IonSpinner, useIonToast } from '@ionic/react';
import { alertCircleOutline, copyOutline, sparkles } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { useCloud } from '@/core/cloud/CloudContext';
import { useLocale } from '@/core/contexts/SettingsContext';
import { usePro } from '@/core/pro/ProContext';
import { planStatus } from '@/core/pro/planStatus';
import { usePaywall } from '@/core/pro/useRequirePro';

/** How long the section waits for RevenueCat before saying it couldn't be reached. */
const SLOW_MS = 8000;

/** "abcd1234…wxyz": enough for support to find the account without showing the whole id. */
const shortId = (id: string) => (id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id);

/**
 * Profile → "Subscription": the Budgy Pro card. A free user sees the pitch with Get Pro / Restore; a subscriber sees
 * an Active pill, what Pro turns on, one line on the plan (amber when it won't renew or the store couldn't charge)
 * and Manage subscription. The Support ID shows either way. The caller renders it only when Budgy Pro is available
 * in this build.
 */
export default function ProSection() {
  const { t } = useTranslation();
  const locale = useLocale();
  const cloud = useCloud();
  const pro = usePro();
  const paywall = usePaywall();
  const [presentToast] = useIonToast();
  const [busy, setBusy] = useState(false);
  // RevenueCat hasn't answered for a while (offline with no saved answer, say): say so and offer to ask again,
  // rather than guessing "Get Pro" for someone who may be subscribed.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (pro.ready) {
      setSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setSlow(true), SLOW_MS);
    return () => window.clearTimeout(timer);
  }, [pro.ready, slow]);
  const tryAgain = () => {
    setSlow(false);
    pro.recheck();
  };

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

  const date = (iso: string) => new Date(iso).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
  const active = pro.ready && pro.isPro;
  const status = active && pro.plan ? planStatus(pro.plan) : null;
  const statusText = status && t(status.key, { plan: status.plan ? t(status.plan) : undefined, date: status.date ? date(status.date) : undefined });

  return (
    <>
      <div className="b-section-title">{t('pro.subscription')}</div>
      <div className={`b-card b-pro${active ? ' b-pro--active' : ''}`}>
        <div className="b-pro__head">
          <span className="b-pro__mark" aria-hidden="true">
            <IonIcon icon={sparkles} />
          </span>
          <div className="b-pro__text">
            <div className="b-pro__title">{t('pro.title')}</div>
            {pro.ready && <p className="b-pro__line">{t(pro.isPro ? 'pro.activeLine' : 'pro.pitch')}</p>}
            {status && (
              <p className={`b-pro__status${status.attention ? ' b-pro__status--attention' : ''}`}>
                {status.attention && <IonIcon icon={alertCircleOutline} />}
                {statusText}
              </p>
            )}
          </div>
          {active && <span className="b-pro__pill">{t('pro.active')}</span>}
        </div>

        {!pro.ready && slow ? (
          <>
            <p className="b-muted" style={{ margin: '0 0 12px', fontSize: 13.5, lineHeight: 1.5 }}>{t('pro.checkFailed')}</p>
            <button className="b-btn b-btn--muted" style={{ width: '100%' }} onClick={tryAgain}>
              {t('pro.tryAgain')}
            </button>
          </>
        ) : !pro.ready ? (
          // Neither the pitch nor the plan until RevenueCat has answered, so a subscriber never sees "Get Pro" flash.
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <IonSpinner name="dots" />
          </div>
        ) : pro.isPro ? (
          <button className="b-btn b-btn--muted" style={{ width: '100%' }} disabled={busy} onClick={() => void manage()}>
            {t('pro.manage')}
          </button>
        ) : (
          <>
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
