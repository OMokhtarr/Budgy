import { dayKey, parseDayKey } from './period';
import { idFromKey } from './id';
import type { Recurring, RepeatUnit } from '@/shared/models';

/** How often a recurring transaction comes back. */
export type Repeat = Pick<Recurring, 'unit' | 'every'>;

/** The choices the editor offers, by name. */
export const REPEATS = {
  daily: { unit: 'day', every: 1 },
  weekly: { unit: 'week', every: 1 },
  biweekly: { unit: 'week', every: 2 },
  monthly: { unit: 'month', every: 1 },
  quarterly: { unit: 'month', every: 3 },
  yearly: { unit: 'year', every: 1 },
} as const satisfies Record<string, Repeat>;
export type RepeatName = keyof typeof REPEATS;

/** The name of a repeat (falls back to monthly for one the editor doesn't offer). */
export function repeatOf({ unit, every }: Repeat): RepeatName {
  const found = (Object.keys(REPEATS) as RepeatName[]).find((k) => REPEATS[k].unit === unit && REPEATS[k].every === every);
  return found ?? 'monthly';
}

/** At most this many due occurrences of one recurring transaction are handled at once. */
export const MAX_DUE = 400;

/** `day` of a month, or the month's last day if it's shorter. */
function dayIn(year: number, month: number, day: number): Date {
  const last = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, last));
}

const DAYS: Partial<Record<RepeatUnit, number>> = { day: 1, week: 7 };

/** Occurrence `n` (0 = the start), counted from the start so short months don't move later ones. */
function occurrence(r: Repeat & Pick<Recurring, 'start'>, n: number): Date {
  const s = parseDayKey(r.start);
  const days = DAYS[r.unit];
  if (days) return new Date(s.getFullYear(), s.getMonth(), s.getDate() + n * r.every * days);
  const months = (r.unit === 'year' ? 12 : 1) * r.every * n;
  return dayIn(s.getFullYear(), s.getMonth() + months, s.getDate());
}

/** About how many occurrences fit between the start and `day`: a safe place to begin counting. */
function indexNear(r: Repeat & Pick<Recurring, 'start'>, day: Date): number {
  const s = parseDayKey(r.start);
  const days = DAYS[r.unit];
  const n = days
    ? Math.floor(Math.round((day.getTime() - s.getTime()) / 86_400_000) / (days * r.every))
    : Math.floor(((day.getFullYear() - s.getFullYear()) * 12 + day.getMonth() - s.getMonth()) / ((r.unit === 'year' ? 12 : 1) * r.every));
  return Math.max(0, n - 1);
}

/** Every occurrence day (YYYY-MM-DD) from `from` to `to`, both included, at most `limit`, and none after `until`. */
export function occurrencesBetween(
  r: Repeat & Pick<Recurring, 'start' | 'until'>,
  from: string,
  to: string,
  limit = MAX_DUE,
): string[] {
  const end = parseDayKey(r.until && r.until < to ? r.until : to);
  const out: string[] = [];
  for (let n = indexNear(r, parseDayKey(from)); out.length < limit; n++) {
    const d = occurrence(r, n);
    if (d > end) break;
    const key = dayKey(d);
    if (key >= from) out.push(key);
  }
  return out;
}

/** Whether it has ended: its next occurrence would come after its last day. */
export function isFinished(r: Pick<Recurring, 'next' | 'until'>): boolean {
  return r.until != null && r.next > r.until;
}

/** The first occurrence after `day`. */
export function nextAfter(r: Repeat & Pick<Recurring, 'start'>, day: string): string {
  const d = parseDayKey(day);
  for (let n = indexNear(r, d); ; n++) {
    const key = dayKey(occurrence(r, n));
    if (key > day) return key;
  }
}

/** The occurrences waiting: from `next` up to today, oldest first. */
export function dueDays(r: Recurring, today: Date, limit = MAX_DUE): string[] {
  const now = dayKey(today);
  return r.next > now ? [] : occurrencesBetween(r, r.next, now, limit);
}

/** The id of an occurrence's transaction: the same on every phone, so two phones adding it write one record. */
export function occurrenceTxId(recurringId: string, day: string): Promise<string> {
  return idFromKey(`recurring:${recurringId}:${day}`);
}

/** When an added occurrence happened: noon on its day, local time. */
export function occurrenceDate(day: string): string {
  const d = parseDayKey(day);
  d.setHours(12);
  return d.toISOString();
}
