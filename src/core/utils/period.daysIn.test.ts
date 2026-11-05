import { describe, expect, it } from 'vitest';
import { daysIn, rangeFor } from './period';

describe('daysIn', () => {
  it('counts the days of a month', () => {
    expect(daysIn(rangeFor('month', new Date(2026, 10, 4)))).toBe(30);
    expect(daysIn(rangeFor('month', new Date(2028, 1, 10)))).toBe(29);
  });

  it('counts a day, a week and a year', () => {
    expect(daysIn(rangeFor('day', new Date(2026, 10, 4)))).toBe(1);
    expect(daysIn(rangeFor('week', new Date(2026, 10, 4)))).toBe(7);
    expect(daysIn(rangeFor('year', new Date(2026, 5, 1)))).toBe(365);
    expect(daysIn(rangeFor('year', new Date(2028, 5, 1)))).toBe(366);
  });

  it('stays whole when a clock change falls inside the period', () => {
    const lostHour = { start: new Date(2026, 0, 1), end: new Date(2026, 6, 1) };
    expect(daysIn(lostHour)).toBe(181);
    expect(daysIn({ start: new Date(2026, 6, 1), end: new Date(2027, 0, 1) })).toBe(184);
  });
});
