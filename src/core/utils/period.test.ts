import { describe, expect, it } from 'vitest';
import { dayKey, formatRange, parseDayKey, setRangeDay, shiftRange, startOfDay } from './period';

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);

describe('shiftRange', () => {
  const week = { start: day(2026, 10, 5), end: day(2026, 10, 12) };

  it('moves a range forward by its own length', () => {
    expect(shiftRange(week, 1)).toEqual({ start: day(2026, 10, 12), end: day(2026, 10, 19) });
  });

  it('moves a range back by several lengths', () => {
    expect(shiftRange(week, -2)).toEqual({ start: day(2026, 9, 21), end: day(2026, 9, 28) });
  });

  // In Cairo the clocks go forward at midnight, so that one day starts at 01:00.
  it('stays on the first moment of each day across every clock change of a year', () => {
    let range = { start: day(2026, 1, 1), end: day(2026, 1, 2) };
    for (let i = 0; i < 366; i++) {
      range = shiftRange(range, 1);
      expect(range.start).toEqual(startOfDay(range.start));
      expect(range.end).toEqual(startOfDay(range.end));
    }
    expect(range.start).toEqual(day(2027, 1, 2));
  });
});

describe('setRangeDay', () => {
  const draft = { from: '2026-10-10', to: '2026-10-20' };

  it('changes only the chosen side when the order stays valid', () => {
    expect(setRangeDay(draft, 'from', '2026-10-01')).toEqual({ from: '2026-10-01', to: '2026-10-20' });
    expect(setRangeDay(draft, 'to', '2026-10-31')).toEqual({ from: '2026-10-10', to: '2026-10-31' });
  });

  it('pulls the end forward when the start passes it', () => {
    expect(setRangeDay(draft, 'from', '2026-11-05')).toEqual({ from: '2026-11-05', to: '2026-11-05' });
  });

  it('pulls the start back when the end goes before it', () => {
    expect(setRangeDay(draft, 'to', '2026-09-15')).toEqual({ from: '2026-09-15', to: '2026-09-15' });
  });
});

describe('parseDayKey', () => {
  it('reads a day key back as local midnight', () => {
    const d = parseDayKey('2026-03-09');
    expect(d).toEqual(day(2026, 3, 9));
    expect(dayKey(d)).toBe('2026-03-09');
  });
});

describe('formatRange', () => {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };

  it('treats the end as exclusive', () => {
    expect(formatRange({ start: day(2026, 11, 2), end: day(2026, 11, 9) }, 'en-GB', opts)).toMatch(/^2\s*[–-]\s*8 Nov$/);
  });

  it('shows a single day once', () => {
    expect(formatRange({ start: day(2026, 11, 2), end: day(2026, 11, 3) }, 'en-GB', opts)).toBe('2 Nov');
  });
});
