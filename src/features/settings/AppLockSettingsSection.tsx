import { useState } from 'react';
import { IonItem, IonLabel, IonList, IonListHeader, IonSelect, IonSelectOption, IonToggle, useIonAlert } from '@ionic/react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/core/contexts/SettingsContext';
import { useAppLock } from '@/core/lock/LockProvider';
import { LOCK_AFTER_OPTIONS } from '@/core/lock/lockController';

const AFTER_LABELS: Record<(typeof LOCK_AFTER_OPTIONS)[number], string> = {
  0: 'lock.afterImmediately',
  60_000: 'lock.afterOneMinute',
  300_000: 'lock.afterFiveMinutes',
};

/** Settings → Security: the app lock (Android only). Turning it on or off asks for the phone's unlock first. */
export default function AppLockSettingsSection() {
  const { t } = useTranslation();
  const { appLock, update } = useSettings();
  const { supported, confirm } = useAppLock();
  const [presentAlert] = useIonAlert();
  // Remounts the toggle so it shows the saved value again after a cancelled unlock.
  const [toggleKey, setToggleKey] = useState(0);

  if (!supported) return null;

  const change = async (enabled: boolean) => {
    const result = await confirm();
    if (result === 'ok') update({ appLock: { ...appLock, enabled } });
    else if (result === 'no-screen-lock') void presentAlert({ message: t('lock.noScreenLock'), buttons: [t('common.close')] });
    setToggleKey((k) => k + 1);
  };

  return (
    <IonList inset>
      <IonListHeader>{t('lock.security')}</IonListHeader>
      <IonItem lines={appLock.enabled ? 'inset' : 'none'}>
        <IonToggle key={toggleKey} checked={appLock.enabled} onIonChange={(e) => void change(e.detail.checked)}>
          <IonLabel>
            {t('lock.toggle')}
            <p>{t('lock.toggleHint')}</p>
          </IonLabel>
        </IonToggle>
      </IonItem>
      {appLock.enabled && (
        <IonItem lines="none">
          <IonSelect
            label={t('lock.after')}
            value={appLock.afterMs}
            interface="action-sheet"
            onIonChange={(e) => update({ appLock: { ...appLock, afterMs: Number(e.detail.value) } })}
          >
            {LOCK_AFTER_OPTIONS.map((ms) => (
              <IonSelectOption key={ms} value={ms}>{t(AFTER_LABELS[ms])}</IonSelectOption>
            ))}
          </IonSelect>
        </IonItem>
      )}
    </IonList>
  );
}
