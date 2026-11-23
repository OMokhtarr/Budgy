import type { Transaction } from '@/shared/models';

/** When tomorrow starts, local time (ms). Anything dated from then on is "after today". */
export function startOfTomorrow(today: Date): number {
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).getTime();
}

/** Whether an ISO date falls after today: tomorrow or later, local time. */
export function isAfterToday(date: string, today: Date): boolean {
  return new Date(date).getTime() >= startOfTomorrow(today);
}

/**
 * Whether a period's lists and totals leave a transaction out for now: an entry on a credit card dated after today
 * (an instalment to come, say). It isn't paid yet, so it joins them on its day; the card page shows it before then.
 */
export function hiddenUntilItsDay(t: Transaction, cardIds: Set<string>, today: Date): boolean {
  return cardIds.has(t.accountId) && isAfterToday(t.date, today);
}
