import { describe, expect, it } from 'vitest';
import { isAfterToday } from './future';

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).toISOString();
const today = new Date(2026, 10, 23, 12);

describe('isAfterToday', () => {
  it('is false for any time today', () => {
    expect(isAfterToday(at(2026, 11, 23, 12), today)).toBe(false);
    expect(isAfterToday(at(2026, 11, 23, 23, 59), today)).toBe(false);
  });

  it('is true from the start of tomorrow on', () => {
    expect(isAfterToday(at(2026, 11, 24, 0), today)).toBe(true);
    expect(isAfterToday(at(2026, 12, 3), today)).toBe(true);
  });
});
