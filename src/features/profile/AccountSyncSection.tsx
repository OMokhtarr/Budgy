import { useEffect, useState } from 'react';
import { IonIcon, IonSpinner, useIonAlert, useIonToast } from '@ionic/react';
import { alertCircleOutline, checkmarkCircleOutline, logoApple, logoGoogle, syncOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { useLocale } from '@/core/contexts/SettingsContext';
import { useCloud } from '@/core/cloud/CloudContext';
import { SignInError, availableProviders, classifySignInError, type Provider } from '@/core/cloud/auth';
import { dayTimeLabel } from '@/core/utils/period';

/**
 * Profile → "Account & sync": optional sign-in with Google / Apple, then sync status, sign out and
 * account deletion. Hidden in builds without cloud settings.
 */
export default function AccountSyncSection() {
  const { t } = useTranslation();
  const locale = useLocale();
  const cloud = useCloud();
  const [presentAlert] = useIonAlert();
  const [presentToast] = useIonToast();
  const [busy, setBusy] = useState(false);

  const toast = (message: string, color = 'medium') => presentToast({ message, duration: 3000, position: 'top', color });

  // A web sign-in that failed comes back to this page with the reason in the URL.
  const { redirectError, clearRedirectError } = cloud;
  useEffect(() => {
    if (!redirectError) return;
    console.warn('Budgy: sign-in failed', redirectError);
    void presentToast({ message: t('cloud.signInFailed'), duration: 3000, position: 'top', color: 'danger' });
    clearRedirectError();
  }, [redirectError, clearRedirectError, presentToast, t]);

  if (!cloud.enabled) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      console.warn('Budgy:', err);
      toast(t('cloud.actionFailed'), 'danger');
    } finally {
      setBusy(false);
    }
  };

  const signIn = async (p: Provider) => {
    setBusy(true);
    try {
      await cloud.signIn(p);
    } catch (err) {
      const kind = classifySignInError(err);
      console.warn('Budgy: sign-in', kind, err instanceof SignInError ? err.original : err);
      // Closing the Google / Apple sheet isn't an error worth reporting.
      if (kind === 'not-configured') toast(t('cloud.notSetUp', { provider: p === 'google' ? 'Google' : 'Apple' }), 'danger');
      else if (kind === 'network') toast(t('cloud.offline'), 'danger');
      else if (kind === 'failed') toast(t('cloud.signInFailed'), 'danger');
    } finally {
      setBusy(false);
    }
  };

  const signOut = () =>
    presentAlert({
      header: t('cloud.signOutTitle'),
      message: t('cloud.signOutMessage'),
      buttons: [
        { text: t('cloud.keepOnDevice'), handler: () => void run(() => cloud.signOut(true)) },
        { text: t('cloud.removeFromDevice'), role: 'destructive', handler: () => void run(() => cloud.signOut(false)) },
        { text: t('common.cancel'), role: 'cancel' },
      ],
    });

  const deleteAccount = () =>
    presentAlert({
      header: t('cloud.deleteTitle'),
      message: t('cloud.deleteMessage'),
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
    cloud.status === 'syncing' ? t('cloud.syncing')
    : cloud.status === 'error' ? t('cloud.error')
    : cloud.lastSyncedAt ? t('cloud.synced', { when: when(cloud.lastSyncedAt) })
    : t('cloud.notSynced');
  const statusIcon = cloud.status === 'error' ? alertCircleOutline : cloud.status === 'syncing' ? syncOutline : checkmarkCircleOutline;

  return (
    <>
      <div className="b-section-title">{t('cloud.title')}</div>
      {!cloud.user ? (
        <div className="b-card" style={{ padding: 14 }}>
          <p className="b-muted" style={{ margin: '0 0 12px', fontSize: 13.5, lineHeight: 1.5 }}>{t('cloud.hint')}</p>
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
            </button>
          ))}
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
            disabled={cloud.status === 'syncing'}
          >
            {cloud.status === 'syncing' ? <IonSpinner name="dots" style={{ width: 16, height: 16 }} /> : <IonIcon icon={statusIcon} />}
            {statusLine}
          </button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
            <button className="b-btn b-btn--muted" disabled={busy || cloud.status === 'syncing'} onClick={cloud.syncNow}>
              <IonIcon icon={syncOutline} />
              {t('cloud.syncNow')}
            </button>
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
