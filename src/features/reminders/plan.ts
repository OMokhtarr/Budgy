import { addDays, dayKey, parseDayKey } from '@/core/utils/period';
import { roundTo } from '@/core/utils/currency';
import { occurrencesBetween } from '@/core/utils/recurring';
import type { CardAmounts, CardStatus } from '@/core/utils/creditCard';
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
  /**
   * The card and what's due on it, per currency (only amounts above zero), with what's left of the minimum payment
   * when it's below that.
   */
  cardTitle: (card: Account, amounts: Record<string, number>, minimum?: Record<string, number>) => string;
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
        // An instalment plan's automatic payment belongs to its card.
        const to = r.planId && r.tx.toAccountId ? `/cards/${r.tx.toAccountId}` : '/recurring';
        out.push({ id: reminderId(`r:${r.id}:${day}`), at: when, title: texts.recurringTitle(r), body: texts.recurringBody(r), to });
      }
    }
  }

  for (const { account, status } of cards) {
    const remind = (dueOn: Date, amounts: Record<string, number>, minimum?: Record<string, number>) => {
      for (const days of [CARD_DAYS_BEFORE, 0]) {
        const day = addDays(dueOn, -days);
        const when = at(day);
        if (when > now) {
          // Keyed by the day, so when the next statement becomes the last one its reminder is replaced, not doubled.
          out.push({
            id: reminderId(`c:${account.id}:${dayKey(day)}`),
            at: when,
            title: texts.cardTitle(account, amounts, minimum),
            body: texts.cardBody(days),
            to: `/cards/${account.id}`,
          });
        }
      }
    };
    const pick = (f: (x: CardAmounts, currency: string) => number) =>
      Object.fromEntries(Object.entries(status.byCurrency).map(([c, x]) => [c, f(x, c)] as const).filter(([, n]) => n > 0));
    // The last statement: only while some of it is left to pay and its due date hasn't passed.
    // The minimum goes with it once, in some currency, it's less than the whole of what's due; then in every currency,
    // since paying only one of them would still leave the other's minimum unpaid.
    if (status.state === 'due') {
      const below = Object.values(status.byCurrency).some((x) => x.minimum != null && x.minimum > 0 && x.minimum < x.due);
      remind(status.cycle.dueOn, pick((x) => x.due), below ? pick((x) => x.minimum ?? 0) : undefined);
    }
    // The next one, set ahead so it comes even if the app isn't opened after the statement: what's owed, less the last
    // statement's part (paid by its own date) and instalments for later statements.
    const next = pick((x, c) => roundTo(x.owed - x.due - x.later, c));
    if (Object.keys(next).length) remind(status.cycle.nextDueOn, next);
  }

  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_REMINDERS);
}
