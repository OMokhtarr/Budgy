import { useEffect, useRef, useState } from 'react';
import { useIonAlert } from '@ionic/react';
import { useTranslation } from 'react-i18next';
import { App as CapApp } from '@capacitor/app';
import type { PermissionState } from '@capacitor/core';
import { useSettings, type SmsImportSettings } from '@/core/contexts/SettingsContext';
import { SmsInbox } from './native';

export interface SmsPermission {
  permission?: PermissionState;
  /** Set after a refused request, so the note explains how to allow it in Android settings. */
  refused: boolean;
  /** Set when the permission check or request throws, so the note asks the user to try again. */
  checkFailed: boolean;
  /** Changes after a cancelled or refused turn-on, to remount a switch so it shows the saved state again. */
  toggleKey: number;
  /** Turns reading on, first showing the disclosure and asking for the permission when it isn't granted. */
  turnOn: () => void;
  /** Saves a change to the bank texts settings. */
  set: (patch: Partial<SmsImportSettings>) => void;
}

/**
 * The SMS permission and the "Read bank texts" turn-on flow. Checks on mount and whenever the app comes
 * back (e.g. after allowing SMS in Android settings), and turns reading off when the permission is gone.
 * Mount it once, on the Bank texts page.
 */
export function useSmsPermission(): SmsPermission {
  const { t } = useTranslation();
  const { smsImport, updateSms: set } = useSettings();
  const [presentAlert] = useIonAlert();
  const [permission, setPermission] = useState<PermissionState>();
  const [refused, setRefused] = useState(false);
  const [toggleKey, setToggleKey] = useState(0);
  const [checkFailed, setCheckFailed] = useState(false);

  // The resume listener is registered once and reads the latest values through this ref.
  const latest = useRef(smsImport);
  latest.current = smsImport;

  useEffect(() => {
    const refresh = async () => {
      try {
        const { sms } = await SmsInbox.checkPermissions();
        setPermission(sms);
        setCheckFailed(false);
        if (sms === 'granted') setRefused(false);
        else if (latest.current.enabled) set({ enabled: false });
      } catch {
        setCheckFailed(true);
      }
    };
    void refresh();
    const handle = CapApp.addListener('resume', () => void refresh());
    return () => {
      void handle.then((h) => h.remove());
    };
  }, [set]);

  // Asks Android again rather than trusting the last answer, which may be from before the permission was taken away.
  const turnOn = () =>
    void SmsInbox.checkPermissions()
      .then(({ sms }) => {
        setPermission(sms);
        setCheckFailed(false);
        if (sms === 'granted') set({ enabled: true });
        else askToTurnOn();
      })
      .catch(() => {
        setCheckFailed(true);
        setToggleKey((k) => k + 1);
      });

  const askToTurnOn = () =>
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

  return { permission, refused, checkFailed, toggleKey, turnOn, set };
}
