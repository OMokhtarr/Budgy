import { useEffect, useRef } from 'react';
import { useIonToast } from '@ionic/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/core/contexts/SettingsContext';
import { alive, db } from '@/core/db/db';
import { useDataActions } from './useDataActions';
import { useCloud } from '@/core/cloud/CloudContext';

/**
 * Everything lives only on this device, so nudge the user to back up: once they have some data and
 * no backup from the last 30 days, a toast offers "Back up now" — at most once a week.
 */
const NUDGED_KEY = 'budgy-backup-nudged-at';
const DAY = 86_400_000;
const MIN_TRANSACTIONS = 10;

function lastNudge(): number {
  try {
    return Number(localStorage.getItem(NUDGED_KEY)) || 0;
  } catch {
    return Date.now(); // storage unavailable: don't nag on every launch
  }
}

export default function BackupReminder() {
  const { t } = useTranslation();
  const { lastBackupAt } = useSettings();
  const { backup } = useDataActions();
  // Held in a ref: useDataActions hands out new functions every render, which would keep resetting the timer.
  const backupRef = useRef(backup);
  backupRef.current = backup;
  const [presentToast] = useIonToast();
  const txCount = useLiveQuery(() => db.transactions.filter(alive).count());
  // Signed in, sync already keeps a copy in the account.
  const { user } = useCloud();

  useEffect(() => {
    if (user || txCount == null || txCount < MIN_TRANSACTIONS) return;
    const now = Date.now();
    const last = lastBackupAt ? Date.parse(lastBackupAt) : 0;
    if (last && now - last < 30 * DAY) return;
    if (now - lastNudge() < 7 * DAY) return;
    // Wait a moment so it doesn't land on top of the app opening.
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(NUDGED_KEY, String(Date.now()));
      } catch {
        /* ignore */
      }
      void presentToast({
        message: last ? t('reminder.stale') : t('reminder.never'),
        duration: 10_000,
        position: 'top',
        color: 'medium',
        buttons: [
          { text: t('profile.backupNow'), handler: () => void backupRef.current() },
          { text: t('common.close'), role: 'cancel' },
        ],
      });
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [user, txCount, lastBackupAt, presentToast, t]);

  return null;
}
