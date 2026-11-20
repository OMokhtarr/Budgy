import { useState } from 'react';
import { IonItem, IonList, IonListHeader, IonNote, IonSelect, IonSelectOption, IonToggle, useIonAlert } from '@ionic/react';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useLocale, useSettings } from '@/core/contexts/SettingsContext';
import { DEFAULT_TIME } from './PhoneReminders';

/** The times of day on offer, every hour from 6:00 to 22:00. */
const TIMES = Array.from({ length: 17 }, (_, i) => `${String(i + 6).padStart(2, '0')}:00`);

/** Settings → Reminders: phone notifications on or off, and when they come. Phones only. */
export default function RemindersSettingsSection() {
  const { t } = useTranslation();
  const locale = useLocale();
  const { reminders, update } = useSettings();
  const [presentAlert] = useIonAlert();
  // Remounts the toggle so it shows "off" again after the permission was refused.
  const [toggleKey, setToggleKey] = useState(0);
  if (!Capacitor.isNativePlatform()) return null;
  const enabled = !!reminders?.enabled;
  const time = reminders?.time ?? DEFAULT_TIME;

  const turn = async (on: boolean) => {
    if (!on) return update({ reminders: { enabled: false, time } });
    let { display } = await LocalNotifications.checkPermissions();
    if (display !== 'granted') ({ display } = await LocalNotifications.requestPermissions());
    if (display === 'granted') return update({ reminders: { enabled: true, time } });
    setToggleKey((k) => k + 1);
    void presentAlert({ header: t('reminders.deniedTitle'), message: t('reminders.deniedMessage'), buttons: [t('common.close')] });
  };

  const timeLabel = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(new Date(2026, 0, 1, h, m));
  };

  return (
    <IonList inset>
      <IonListHeader>{t('reminders.title')}</IonListHeader>
      <IonItem>
        <IonToggle key={toggleKey} checked={enabled} onIonChange={(e) => void turn(e.detail.checked)}>
          {t('reminders.phone')}
        </IonToggle>
      </IonItem>
      {enabled && (
        <IonItem>
          <IonSelect
            label={t('reminders.time')}
            value={time}
            interface="action-sheet"
            onIonChange={(e) => update({ reminders: { enabled: true, time: e.detail.value as string } })}
          >
            {TIMES.map((x) => (
              <IonSelectOption key={x} value={x}>{timeLabel(x)}</IonSelectOption>
            ))}
          </IonSelect>
        </IonItem>
      )}
      <IonItem lines="none">
        <IonNote style={{ fontSize: 12.5, padding: '8px 0' }}>{t('reminders.hint')}</IonNote>
      </IonItem>
    </IonList>
  );
}
