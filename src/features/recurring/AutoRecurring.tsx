import { useEffect, useRef } from 'react';
import { useIonToast } from '@ionic/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { alive, db } from '@/core/db/db';
import { dayKey } from '@/core/utils/period';
import { addDueAuto } from './actions';
import { useRateFor } from './hooks';

/**
 * Adds the due occurrences of the recurring transactions set to add automatically: when the app opens, when it
 * comes back, and when one of them changes (e.g. one made today, or one arriving from another phone).
 */
export default function AutoRecurring() {
  const { t } = useTranslation();
  const [presentToast] = useIonToast();
  const rateFor = useRateFor();
  const rateRef = useRef(rateFor);
  rateRef.current = rateFor;
  // The earliest day one of them is waiting for: changes when one is added, edited or synced in.
  const firstNext = useLiveQuery(async () => {
    const auto = (await db.recurring.filter(alive).toArray()).filter((r) => r.auto);
    return auto.reduce((min, r) => (r.next < min ? r.next : min), '9999-12-31');
  });
  // Kept outside the effect so a quick second trigger can't add while the first is still adding.
  const running = useRef(false);

  useEffect(() => {
    if (firstNext == null) return;
    const run = async () => {
      if (running.current || firstNext > dayKey(new Date())) return;
      running.current = true;
      try {
        const added = await addDueAuto(new Date(), rateRef.current);
        if (added) void presentToast({ message: t('recurring.autoAdded', { count: added }), duration: 2600, position: 'top', color: 'medium' });
      } catch (err) {
        console.warn('Budgy: adding recurring transactions failed', err);
      } finally {
        running.current = false;
      }
    };
    void run();
    // Coming back to the app on a later day.
    const onVisible = () => document.visibilityState === 'visible' && void run();
    document.addEventListener('visibilitychange', onVisible);
    const resume = Capacitor.isNativePlatform() ? CapApp.addListener('resume', () => void run()) : undefined;
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void resume?.then((h) => h.remove());
    };
  }, [firstNext, presentToast, t]);

  return null;
}
