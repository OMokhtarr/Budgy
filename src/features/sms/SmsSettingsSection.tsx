import { useCallback, useEffect, useRef, useState } from 'react';
import { IonChip, IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonNote, IonToggle, useIonAlert } from '@ionic/react';
import { add, closeCircle } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { App as CapApp } from '@capacitor/app';
import type { PermissionState } from '@capacitor/core';
import { useSettings, type SmsImportSettings } from '@/core/contexts/SettingsContext';
import { SmsInbox } from './native';
import { addSender, removeSender } from './senderList';

/** Settings → Import from SMS: the switch (with disclosure and permission) and the bank sender keywords. */
export default function SmsSettingsSection() {
  const { t } = useTranslation();
  const { smsImport, update } = useSettings();
  const [presentAlert] = useIonAlert();
  const [permission, setPermission] = useState<PermissionState>();
  // Set after a refused request, so the note explains how to allow it in Android settings.
  const [refused, setRefused] = useState(false);
  // Remounts the switch so it shows the saved state again after a cancelled or refused turn-on.
  const [toggleKey, setToggleKey] = useState(0);
  // Set when the permission check or request throws, so the note asks the user to try again.
  const [checkFailed, setCheckFailed] = useState(false);

  const set = useCallback(
    (patch: Partial<SmsImportSettings>) => update({ smsImport: { ...smsImport, ...patch } }),
    [smsImport, update],
  );

  // The resume listener is registered once and reads the latest values through this ref.
  const latest = useRef({ smsImport, set });
  latest.current = { smsImport, set };

  // Checked on open and whenever the app comes back, e.g. after allowing SMS in Android settings.
  useEffect(() => {
    const refresh = async () => {
      try {
        const { sms } = await SmsInbox.checkPermissions();
        setPermission(sms);
        setCheckFailed(false);
        if (sms === 'granted') setRefused(false);
        else if (latest.current.smsImport.enabled) latest.current.set({ enabled: false });
      } catch {
        setCheckFailed(true);
      }
    };
    void refresh();
    const handle = CapApp.addListener('resume', () => void refresh());
    return () => {
      void handle.then((h) => h.remove());
    };
  }, []);

  const turnOn = () => {
    if (permission === 'granted') {
      set({ enabled: true });
      return;
    }
    presentAlert({
      header: t('sms.disclosureTitle'),
      message: t('sms.disclosureBody'),
      backdropDismiss: false,
      buttons: [
        { text: t('common.cancel'), role: 'cancel', handler: () => setToggleKey((k) => k + 1) },
        {
          text: t('sms.continue'),
          handler: () => {
            void SmsInbox.requestPermissions()
              .then(({ sms }) => {
                setPermission(sms);
                setCheckFailed(false);
                if (sms === 'granted') {
                  setRefused(false);
                  set({ enabled: true });
                } else {
                  setRefused(true);
                  setToggleKey((k) => k + 1);
                }
              })
              .catch(() => {
                setCheckFailed(true);
                setToggleKey((k) => k + 1);
              });
          },
        },
      ],
    });
  };

  const askSender = () =>
    presentAlert({
      header: t('sms.addSenderTitle'),
      inputs: [{ name: 'keyword', type: 'text', placeholder: t('sms.addSenderPlaceholder') }],
      buttons: [
        { text: t('common.cancel'), role: 'cancel' },
        { text: t('sms.addSender'), handler: (data: { keyword?: string }) => set({ senders: addSender(smsImport.senders, data.keyword ?? '') }) },
      ],
    });

  return (
    <IonList inset>
      <IonListHeader>{t('sms.title')}</IonListHeader>
      <IonItem>
        <IonToggle
          key={toggleKey}
          checked={smsImport.enabled}
          onIonChange={(e) => (e.detail.checked ? turnOn() : set({ enabled: false }))}
        >
          {t('sms.readTexts')}
        </IonToggle>
      </IonItem>
      {(refused || permission === 'denied') && (
        <IonItem lines="none">
          <IonNote style={{ fontSize: 12.5, padding: '8px 0' }}>{t('sms.permissionDenied')}</IonNote>
        </IonItem>
      )}
      {checkFailed && (
        <IonItem lines="none">
          <IonNote color="danger" style={{ fontSize: 12.5, padding: '8px 0' }}>{t('sms.permissionError')}</IonNote>
        </IonItem>
      )}
      <IonItem>
        <IonLabel>{t('sms.permission')}</IonLabel>
        <IonNote slot="end">{t(permission === 'granted' ? 'sms.permissionAllowed' : 'sms.permissionNotAllowed')}</IonNote>
      </IonItem>
      <IonItem>
        <IonLabel>
          {t('sms.senders')}
          <div style={{ marginTop: 6 }}>
            {smsImport.senders.map((s) => (
              <IonChip key={s} onClick={() => set({ senders: removeSender(smsImport.senders, s) })}>
                <IonLabel>{s}</IonLabel>
                <IonIcon icon={closeCircle} />
              </IonChip>
            ))}
            <IonChip outline color="primary" onClick={askSender}>
              <IonIcon icon={add} />
              <IonLabel>{t('sms.addSender')}</IonLabel>
            </IonChip>
          </div>
        </IonLabel>
      </IonItem>
      <IonItem lines="none">
        <IonNote style={{ fontSize: 12.5, padding: '8px 0' }}>{t('sms.sendersHint')}</IonNote>
      </IonItem>
    </IonList>
  );
}
