import type { DateRange, PeriodMode } from '@/shared/models';

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  const day = x.getDate();
  x.setDate(1);
  x.setMonth(x.getMonth() + n);
  const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
  x.setDate(Math.min(day, last));
  return x;
}

/** weekStart: 0 = Sunday, 1 = Monday, 6 = Saturday */
export function rangeFor(mode: PeriodMode, anchor: Date, weekStart = 6): DateRange {
  const a = startOfDay(anchor);
  switch (mode) {
    case 'day':
      return { start: a, end: addDays(a, 1) };
    case 'week': {
      const diff = (a.getDay() - weekStart + 7) % 7;
      const start = addDays(a, -diff);
      return { start, end: addDays(start, 7) };
    }
    case 'month': {
      const start = new Date(a.getFullYear(), a.getMonth(), 1);
      return { start, end: new Date(a.getFullYear(), a.getMonth() + 1, 1) };
    }
    case 'year': {
      const start = new Date(a.getFullYear(), 0, 1);
      return { start, end: new Date(a.getFullYear() + 1, 0, 1) };
    }
    case 'all':
    default:
      return { start: new Date(1970, 0, 1), end: new Date(9999, 0, 1) };
  }
}

export function shiftAnchor(mode: PeriodMode, anchor: Date, dir: 1 | -1): Date {
  switch (mode) {
    case 'day': return addDays(anchor, dir);
    case 'week': return addDays(anchor, 7 * dir);
    case 'month': return addMonths(anchor, dir);
    case 'year': return addMonths(anchor, 12 * dir);
    default: return anchor;
  }
}

/** Moves the anchor by `steps` whole periods (negative = back in time). */
export function shiftBy(mode: PeriodMode, anchor: Date, steps: number): Date {
  let d = anchor;
  const dir = steps < 0 ? -1 : 1;
  for (let i = 0; i < Math.abs(steps); i++) d = shiftAnchor(mode, d, dir);
  return d;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Day key in local time, e.g. "2026-11-02". */
/** "Today, 4:09 PM", "Yesterday, 9:30 AM" or "Oct 28, 2026, 4:09 PM". */
export function dayTimeLabel(d: Date, locale: string, labels: { today: string; yesterday: string }): string {
  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(d);
  const now = new Date();
  if (isSameDay(d, now)) return `${labels.today}, ${time}`;
  if (isSameDay(d, addDays(now, -1))) return `${labels.yesterday}, ${time}`;
  return `${new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(d)}, ${time}`;
}

export function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
