import { addDays, dayKey, parseDayKey } from '@/core/utils/period';
import { occurrencesBetween } from '@/core/utils/recurring';
import type { CardStatus } from '@/core/utils/creditCard';
import type { Account, Recurring } from '@/shared/models';

/** How far ahead reminders are scheduled; opening the app schedules the next ones. */
export const HORIZON_DAYS = 60;
/** At most this many are scheduled at once (iOS keeps only 64 pending). */
export const MAX_REMINDERS = 50;
/** A card is reminded of this many days before its due date, and on the day. */
export const CARD_DAYS_BEFORE = 3;

export interface PlannedReminder {
  id: number;
  at: Date;
  title: string;
  body: string;
  /** The page a tap opens. */
  to: string;
}

/** The words of each reminder, already translated and with amounts formatted. */
export interface ReminderTexts {
  recurringTitle: (r: Recurring) => string;
  recurringBody: (r: Recurring) => string;
  cardTitle: (card: Account, status: CardStatus) => string;
  /** Days until the due date: CARD_DAYS_BEFORE, or 0 on the day. */
  cardBody: (days: number) => string;
}

export interface PlanInput {
  recurring: Recurring[];
  cards: { account: Account; status: CardStatus }[];
  now: Date;
  /** The time of day reminders come, local time. */
  time: { hour: number; minute: number };
  texts: ReminderTexts;
}

/** A positive 31-bit number from a key (FNV-1a), so the same reminder keeps its id when scheduled again. */
export function reminderId(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h & 0x7fffffff) || 1;
}

/** The reminders to schedule: the soonest ones still to come, at most MAX_REMINDERS. */
export function planReminders({ recurring, cards, now, time, texts }: PlanInput): PlannedReminder[] {
  const at = (day: Date) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), time.hour, time.minute);
  const today = dayKey(now);
  const last = dayKey(addDays(now, HORIZON_DAYS));
  const out: PlannedReminder[] = [];

  for (const r of recurring) {
    const from = r.next > today ? r.next : today;
    for (const day of occurrencesBetween(r, from, last, MAX_REMINDERS)) {
      const when = at(parseDayKey(day));
      if (when > now) {
        out.push({ id: reminderId(`r:${r.id}:${day}`), at: when, title: texts.recurringTitle(r), body: texts.recurringBody(r), to: '/recurring' });
      }
    }
  }

  for (const { account, status } of cards) {
    // Only while some of the statement is left to pay and the due date hasn't passed.
    if (status.state !== 'due') continue;
    for (const days of [CARD_DAYS_BEFORE, 0]) {
      const day = addDays(status.cycle.dueOn, -days);
      const when = at(day);
      if (when > now) {
        out.push({ id: reminderId(`c:${account.id}:${dayKey(day)}`), at: when, title: texts.cardTitle(account, status), body: texts.cardBody(days), to: '/accounts' });
      }
    }
  }

  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_REMINDERS);
}
