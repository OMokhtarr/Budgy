import { useEffect, useMemo, useRef, useState } from 'react';
import { useIonRouter } from '@ionic/react';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useMoney, useSettings } from '@/core/contexts/SettingsContext';
import { useAccounts, useCardStatuses, useNames } from '@/core/db/hooks';
import { useRecurring } from '@/features/recurring/hooks';
import { planReminders, type PlannedReminder, type ReminderTexts } from './plan';

export const DEFAULT_TIME = '09:00';
const CHANNEL = 'reminders';

/** Replaces every pending reminder with `plan`. */
async function reschedule(plan: PlannedReminder[], channelName: string): Promise<void> {
  const { display } = await LocalNotifications.checkPermissions();
  if (display !== 'granted') return;
  if (Capacitor.getPlatform() === 'android') {
    // Private: a locked phone shows that a reminder came, not the amounts.
    await LocalNotifications.createChannel({ id: CHANNEL, name: channelName, importance: 3, visibility: 0 });
  }
  await clearReminders();
  if (!plan.length) return;
  await LocalNotifications.schedule({
    notifications: plan.map((p) => ({
      id: p.id,
      title: p.title,
      body: p.body,
      channelId: CHANNEL,
      schedule: { at: p.at, allowWhileIdle: true },
      // Inexact: Android's exact alarms need a permission Play restricts, and a few minutes late is fine.
      isExactNotification: false,
      extra: { to: p.to },
    })),
  });
}

/** Cancels every reminder still waiting to show. */
export async function clearReminders(): Promise<void> {
  const { notifications } = await LocalNotifications.getPending();
  if (notifications.length) await LocalNotifications.cancel({ notifications: notifications.map(({ id }) => ({ id })) });
}

/**
 * Keeps the phone's scheduled reminders matching the recurring transactions and credit cards: again whenever
 * they, the settings or the language change, and when the app comes back (days pass). A tap opens the page.
 */
export default function PhoneReminders() {
  const native = Capacitor.isNativePlatform();
  const { t, i18n } = useTranslation();
  const money = useMoney();
  const { reminders } = useSettings();
  const on = native && !!reminders?.enabled;
  const time = reminders?.time ?? DEFAULT_TIME;
  const recurring = useRecurring();
  const accounts = useAccounts();
  const statuses = useCardStatuses();
  const { accountName } = useNames();
  const [resumed, setResumed] = useState(0);
  const router = useIonRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    if (!native) return;
    const tapped = LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
      const to: unknown = notification.extra?.to;
      // Accounts is a tab; Recurring opens on top of one, like the menu's pages, so back leaves it.
      if (typeof to === 'string') routerRef.current.push(to, to === '/accounts' ? 'root' : 'forward');
    });
    const resume = CapApp.addListener('resume', () => setResumed((n) => n + 1));
    return () => {
      void tapped.then((h) => h.remove());
      void resume.then((h) => h.remove());
    };
  }, [native]);

  const texts = useMemo((): ReminderTexts => {
    const byId = new Map((accounts ?? []).map((a) => [a.id!, a]));
    return {
      // General on purpose: notifications show on the lock screen, so no name or amount. An instalment plan's
      // payment says which card and how much, like the card's own due-date reminder.
      recurringTitle: (r) =>
        r.planId
          ? t('reminders.instalmentTitle', { name: accountName(byId.get(r.tx.toAccountId!)), amount: money.format(r.tx.amount, r.tx.currency) })
          : t('reminders.recurringTitle'),
      recurringBody: (r) =>
        r.planId
          ? t('reminders.instalmentBody', { from: accountName(byId.get(r.tx.accountId)) })
          : t(r.auto ? 'reminders.recurringAuto' : 'reminders.recurringAsk'),
      cardTitle: (a, amounts, minimum) => {
        const join = (x: Record<string, number>) => Object.entries(x).map(([c, n]) => money.format(n, c)).join(' + ');
        const min = minimum ? ` (${t('reminders.minimumAbout', { amount: join(minimum) })})` : '';
        return `${accountName(a)} · ${join(amounts)}${min}`;
      },
      cardBody: (days) => (days ? t('reminders.cardSoon', { count: days }) : t('reminders.cardToday')),
    };
  }, [t, money, accountName, accounts]);

  useEffect(() => {
    if (!native) return;
    if (!on) {
      void clearReminders().catch(() => {});
      return;
    }
    if (!recurring || !accounts || !statuses) return;
    // Waits for a burst of changes (a sync, an auto-add) to settle.
    const timer = window.setTimeout(() => {
      const [hour, minute] = time.split(':').map(Number);
      const cards = accounts.flatMap((account) => {
        const status = statuses.get(account.id!);
        return status ? [{ account, status }] : [];
      });
      const plan = planReminders({ recurring, cards, now: new Date(), time: { hour, minute }, texts });
      reschedule(plan, t('reminders.channel')).catch((err) => console.warn('Budgy: scheduling reminders failed', err));
    }, 800);
    return () => window.clearTimeout(timer);
  }, [native, on, time, recurring, accounts, statuses, texts, resumed, t, i18n.language]);

  return null;
}
