import { describe, expect, it } from 'vitest';
import { dueDays, nextAfter, occurrenceDate, occurrencesBetween, occurrenceTxId, repeatOf } from './recurring';
import type { Recurring } from '@/shared/models';

const rule = (over: Partial<Recurring> = {}): Recurring => ({
  id: 'r1',
  tx: { type: 'expense', amount: 100, currency: 'EGP', accountId: 'a', categoryId: 'c' },
  unit: 'month',
  every: 1,
  start: '2026-01-31',
  next: '2026-01-31',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('occurrencesBetween', () => {
  it('keeps a monthly one on its day, using the last day of shorter months', () => {
    expect(occurrencesBetween(rule(), '2026-01-01', '2026-05-31')).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31',
    ]);
  });

  it('counts weeks from the start', () => {
    const r = rule({ unit: 'week', every: 2, start: '2026-11-02', next: '2026-11-02' });
    expect(occurrencesBetween(r, '2026-11-10', '2026-12-01')).toEqual(['2026-11-16', '2026-11-30']);
  });

  it('counts days, and every 3 months', () => {
    expect(occurrencesBetween(rule({ unit: 'day', start: '2026-02-27' }), '2026-02-27', '2026-03-02')).toEqual([
      '2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02',
    ]);
    expect(occurrencesBetween(rule({ every: 3, start: '2026-11-15' }), '2026-11-01', '2027-06-01')).toEqual([
      '2026-11-15', '2027-02-15', '2027-05-15',
    ]);
  });

  it('moves 29 February to the 28th in other years', () => {
    expect(occurrencesBetween(rule({ unit: 'year', start: '2028-02-29' }), '2028-01-01', '2030-12-31')).toEqual([
      '2028-02-29', '2029-02-28', '2030-02-28',
    ]);
  });

  it('has nothing before the start', () => {
    expect(occurrencesBetween(rule({ start: '2026-06-10' }), '2026-01-01', '2026-06-09')).toEqual([]);
  });
});

describe('nextAfter', () => {
  it('is the first occurrence after the day', () => {
    expect(nextAfter(rule(), '2026-01-31')).toBe('2026-02-28');
    expect(nextAfter(rule(), '2026-02-28')).toBe('2026-03-31');
    expect(nextAfter(rule({ unit: 'week', start: '2026-11-02' }), '2026-11-05')).toBe('2026-11-09');
  });
});

describe('dueDays', () => {
  it('lists every occurrence from next up to today', () => {
    expect(dueDays(rule({ next: '2026-02-28' }), new Date(2026, 3, 30, 8))).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('is empty while next is still ahead', () => {
    expect(dueDays(rule({ next: '2026-05-31' }), new Date(2026, 4, 30))).toEqual([]);
  });

  it('stops at the limit', () => {
    expect(dueDays(rule({ unit: 'day', start: '2026-01-01', next: '2026-01-01' }), new Date(2026, 11, 31), 5)).toHaveLength(5);
  });
});

describe('occurrenceTxId', () => {
  it('is the same on every phone and differs per day', async () => {
    const a = await occurrenceTxId('r1', '2026-02-28');
    expect(a).toBe(await occurrenceTxId('r1', '2026-02-28'));
    expect(a).not.toBe(await occurrenceTxId('r1', '2026-03-31'));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('occurrenceDate', () => {
  it('is noon local time on the day', () => {
    const d = new Date(occurrenceDate('2026-03-31'));
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 2, 31, 12]);
  });
});

describe('repeatOf', () => {
  it('names the six choices', () => {
    expect(repeatOf({ unit: 'week', every: 2 })).toBe('biweekly');
    expect(repeatOf({ unit: 'month', every: 3 })).toBe('quarterly');
    expect(repeatOf({ unit: 'year', every: 1 })).toBe('yearly');
  });
});
