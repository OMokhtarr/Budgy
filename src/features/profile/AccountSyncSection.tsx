import { useEffect, useState } from 'react';
import { IonIcon, IonSpinner, useIonActionSheet, useIonAlert, useIonToast } from '@ionic/react';
import { alertCircleOutline, checkmarkCircleOutline, logoApple, logoGoogle, pauseCircleOutline, syncOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { useLocale } from '@/core/contexts/SettingsContext';
import { SyncWaitingError, useCloud } from '@/core/cloud/CloudContext';
import { SignInError, availableProviders, classifySignInError, type Provider } from '@/core/cloud/auth';
import { usePro } from '@/core/pro/ProContext';
import { showsProLock } from '@/core/pro/rules';
import { usePaywall, useRequirePro } from '@/core/pro/useRequirePro';
import { dayTimeLabel } from '@/core/utils/period';
import ProBadge from '@/shared/components/ProBadge';

/**
 * Profile → "Account & sync": optional sign-in with Google / Apple, then sync status, sign out and
 * account deletion. Hidden in builds without cloud settings. With the Budgy Pro gate on, sign-in and sync are
 * part of Pro: a free user's sign-in goes through the paywall, and a signed-in account without Pro is paused.
 */
export default function AccountSyncSection() {
  const { t } = useTranslation();
  const locale = useLocale();
  const cloud = useCloud();
  const pro = usePro();
  const requirePro = useRequirePro();
  const paywall = usePaywall();
  const [presentAlert] = useIonAlert();
  const [presentSheet] = useIonActionSheet();
  const [presentToast] = useIonToast();
  const [busy, setBusy] = useState(false);
  // Set by "Already have Pro? Sign in": if the account turns out not to have Pro, the paywall opens once.
  const [paywallAfterSignIn, setPaywallAfterSignIn] = useState(false);

  const toast = (message: string, color = 'medium') => presentToast({ message, duration: 3000, position: 'top', color });

  // A web sign-in that failed comes back to this page with the reason in the URL.
  const { redirectError, clearRedirectError } = cloud;
  useEffect(() => {
    if (!redirectError) return;
    console.warn('Budgy: sign-in failed', redirectError);
    void presentToast({ message: t('cloud.signInFailed'), duration: 3000, position: 'top', color: 'danger' });
    clearRedirectError();
  }, [redirectError, clearRedirectError, presentToast, t]);

  const { user } = cloud;
  const { gateOn, isPro, ready, accountId } = pro;

  // Waits until RevenueCat has answered for the account just signed in to, not the identity before it.
  useEffect(() => {
    if (!paywallAfterSignIn || !user || accountId !== user.id || !ready) return;
    setPaywallAfterSignIn(false);
    if (gateOn && !isPro) void paywall();
  }, [paywallAfterSignIn, user, accountId, ready, gateOn, isPro, paywall]);

  if (!cloud.enabled) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      console.warn('Budgy:', err);
      // Refused before anything changed: say why, so it doesn't look like something broke.
      toast(t(err instanceof SyncWaitingError ? 'cloud.waitingForPro' : 'cloud.actionFailed'), err instanceof SyncWaitingError ? 'medium' : 'danger');
    } finally {
      setBusy(false);
    }
  };

  const withBusy = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  /** Resolves true once signed in; failures are toasted here. */
  const providerSignIn = async (p: Provider): Promise<boolean> => {
    try {
      await cloud.signIn(p);
      return true;
    } catch (err) {
      const kind = classifySignInError(err);
      console.warn('Budgy: sign-in', kind, err instanceof SignInError ? err.original : err);
      // Closing the Google / Apple sheet isn't an error worth reporting.
      if (kind === 'not-configured') toast(t('cloud.notSetUp', { provider: p === 'google' ? 'Google' : 'Apple' }), 'danger');
      else if (kind === 'network') toast(t('cloud.offline'), 'danger');
      else if (kind === 'failed') toast(t('cloud.signInFailed'), 'danger');
      return false;
    }
  };

  // A free user sees the paywall first and signs in only once subscribed.
  const signIn = (p: Provider) =>
    withBusy(() =>
      requirePro(async () => {
        await providerSignIn(p);
      }),
    );

  // "Already have Pro?": sign in straight away; the paywall follows if the account turns out not to have it.
  const signInHavingPro = (p: Provider) =>
    withBusy(async () => {
      if (await providerSignIn(p)) setPaywallAfterSignIn(true);
    });

  const pickProviderHavingPro = () => {
    const providers = availableProviders();
    if (providers.length === 1) {
      void signInHavingPro(providers[0]);
      return;
    }
    void presentSheet({
      buttons: [
        ...providers.map((p) => ({ text: t(p === 'google' ? 'cloud.google' : 'cloud.apple'), handler: () => void signInHavingPro(p) })),
        { text: t('common.cancel'), role: 'cancel' },
      ],
    });
  };

  const paused = cloud.status === 'paused';

  const signOut = () =>
    presentAlert({
      header: t('cloud.signOutTitle'),
      // "Remove" normally uploads first, which can't happen while sync is paused or still waiting for Pro.
      message: t(cloud.syncBlocked ? 'cloud.signOutPausedMessage' : 'cloud.signOutMessage'),
      buttons: [
        { text: t('cloud.keepOnDevice'), handler: () => void run(() => cloud.signOut(true)) },
        { text: t('cloud.removeFromDevice'), role: 'destructive', handler: () => void run(() => cloud.signOut(false)) },
        { text: t('common.cancel'), role: 'cancel' },
      ],
    });

  const deleteAccount = () =>
    presentAlert({
      header: t('cloud.deleteTitle'),
      // Deleting the account doesn't end a store subscription.
      message: isPro && pro.plan?.willRenew ? `${t('cloud.deleteMessage')} ${t('pro.cancelInStoreFirst')}` : t('cloud.deleteMessage'),
      buttons: [
        {
          text: t('cloud.deleteKeepLocal'),
          role: 'destructive',
          handler: () => void run(async () => { await cloud.deleteAccount(true); toast(t('cloud.deleted'), 'success'); }),
        },
        {
          text: t('cloud.deleteEverything'),
          role: 'destructive',
          handler: () => void run(async () => { await cloud.deleteAccount(false); toast(t('cloud.deleted'), 'success'); }),
        },
        { text: t('common.cancel'), role: 'cancel' },
      ],
    });

  const when = (iso: string) => dayTimeLabel(new Date(iso), locale, { today: t('period.today'), yesterday: t('period.yesterday') });
  const statusLine =
    paused ? t(pro.hadPro ? 'cloud.pausedEnded' : 'cloud.pausedNeverPro')
    : cloud.status === 'syncing' ? t('cloud.syncing')
    : cloud.status === 'error' ? t('cloud.error')
    : cloud.lastSyncedAt ? t('cloud.synced', { when: when(cloud.lastSyncedAt) })
    : t('cloud.notSynced');
  const statusIcon =
    paused ? pauseCircleOutline
    : cloud.status === 'error' ? alertCircleOutline
    : cloud.status === 'syncing' ? syncOutline
    : checkmarkCircleOutline;
  // Only once RevenueCat has answered, so a subscriber never sees the badges flash.
  const proLocked = showsProLock(pro);

  return (
    <>
      <div className="b-section-title">{t('cloud.title')}</div>
      {!cloud.user ? (
        <div className="b-card" style={{ padding: 14 }}>
          <p className="b-muted" style={{ margin: '0 0 12px', fontSize: 13.5, lineHeight: 1.5 }}>{t(gateOn ? 'cloud.hint' : 'cloud.hintNoGate')}</p>
          {availableProviders().map((p) => (
            <button
              key={p}
              className="b-btn b-btn--muted"
              style={{ width: '100%', marginTop: 8 }}
              disabled={busy}
              onClick={() => void signIn(p)}
            >
              <IonIcon icon={p === 'google' ? logoGoogle : logoApple} />
              {t(p === 'google' ? 'cloud.google' : 'cloud.apple')}
              {proLocked && <ProBadge />}
            </button>
          ))}
          {proLocked && (
            <button
              className="b-muted"
              style={{ display: 'block', margin: '14px auto 2px', padding: 0, border: 'none', background: 'none', font: 'inherit', fontSize: 13, textDecoration: 'underline' }}
              disabled={busy}
              onClick={pickProviderHavingPro}
            >
              {t('cloud.alreadyPro')}
            </button>
          )}
        </div>
      ) : (
        <div className="b-card" style={{ padding: 14 }}>
          <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {t('cloud.signedInAs', { email: cloud.user.email ?? cloud.user.id })}
          </div>
          <button
            className="b-muted"
            style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0 0', padding: 0, border: 'none', background: 'none', font: 'inherit', fontSize: 13 }}
            onClick={cloud.syncNow}
            disabled={cloud.status === 'syncing' || paused}
          >
            {cloud.status === 'syncing' ? <IonSpinner name="dots" style={{ width: 16, height: 16 }} /> : <IonIcon icon={statusIcon} />}
            {statusLine}
          </button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
            {paused ? (
              <button
                className="b-btn b-btn--primary"
                disabled={busy}
                onClick={() =>
                  void withBusy(async () => {
                    await paywall();
                  })
                }
              >
                {t('pro.renew')}
              </button>
            ) : (
              <button className="b-btn b-btn--muted" disabled={busy || cloud.status === 'syncing'} onClick={cloud.syncNow}>
                <IonIcon icon={syncOutline} />
                {t('cloud.syncNow')}
              </button>
            )}
            <button className="b-btn b-btn--muted" disabled={busy} onClick={signOut}>
              {t('cloud.signOut')}
            </button>
          </div>
          <button
            className="b-btn"
            style={{ width: '100%', marginTop: 10, background: 'transparent', color: 'var(--b-expense)' }}
            disabled={busy}
            onClick={deleteAccount}
          >
            {t('cloud.deleteAccount')}
          </button>
        </div>
      )}
    </>
  );
}
