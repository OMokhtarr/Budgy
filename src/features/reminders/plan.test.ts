import { describe, expect, it } from 'vitest';
import { MAX_REMINDERS, planReminders, reminderId, type ReminderTexts } from './plan';
import type { CardStatus } from '@/core/utils/creditCard';
import type { Account, Recurring } from '@/shared/models';

const texts: ReminderTexts = {
  recurringTitle: (r) => `R ${r.id}`,
  recurringBody: (r) => (r.auto ? 'auto' : 'ask'),
  cardTitle: (a) => `C ${a.id}`,
  cardBody: (days) => `in ${days}`,
};

const rent: Recurring = {
  id: 'rent',
  tx: { type: 'expense', amount: 5000, currency: 'EGP', accountId: 'bank', categoryId: 'home' },
  unit: 'month',
  every: 1,
  start: '2026-10-01',
  next: '2026-12-01',
  createdAt: 'x',
};

const visa = { id: 'visa', name: 'Visa', type: 'card', icon: 'card', color: '#000', currency: 'EGP', initialBalance: 0, order: 0, createdAt: 'x' } as Account;
const status = (state: CardStatus['state'], dueOn: Date): CardStatus => ({
  cycle: { statementOn: new Date(2026, 10, 25), dueOn, nextStatementOn: new Date(2026, 11, 25) },
  byCurrency: {},
  state,
  daysLeft: 0,
});

const now = new Date(2026, 10, 20, 10, 0); // 20 Nov, 10:00
const time = { hour: 9, minute: 0 };

describe('planReminders', () => {
  it('reminds of each occurrence in the next 60 days at the chosen time, from next on', () => {
    const plan = planReminders({ recurring: [rent], cards: [], now, time, texts });
    expect(plan.map((p) => p.at)).toEqual([new Date(2026, 11, 1, 9), new Date(2027, 0, 1, 9)]);
    expect(plan[0]).toMatchObject({ title: 'R rent', body: 'ask', to: '/recurring' });
  });

  it("skips today's once the time has passed, and nothing before next", () => {
    const today = { ...rent, unit: 'day' as const, start: '2026-11-01', next: '2026-11-19' };
    const plan = planReminders({ recurring: [today], cards: [], now, time, texts });
    expect(plan[0].at).toEqual(new Date(2026, 10, 21, 9));
  });

  it('reminds of a card 3 days before its due date and on the day, while something is left to pay', () => {
    const due = planReminders({ recurring: [], cards: [{ account: visa, status: status('due', new Date(2026, 11, 10)) }], now, time, texts });
    expect(due.map((p) => [p.at, p.body, p.to])).toEqual([
      [new Date(2026, 11, 7, 9), 'in 3', '/accounts'],
      [new Date(2026, 11, 10, 9), 'in 0', '/accounts'],
    ]);
    const paid = planReminders({ recurring: [], cards: [{ account: visa, status: status('paid', new Date(2026, 11, 10)) }], now, time, texts });
    expect(paid).toEqual([]);
  });

  it(`keeps the soonest ${MAX_REMINDERS}`, () => {
    const daily = { ...rent, unit: 'day' as const, next: '2026-11-21' };
    const plan = planReminders({ recurring: [daily, { ...daily, id: 'b' }], cards: [], now, time, texts });
    expect(plan).toHaveLength(MAX_REMINDERS);
    expect(plan.every((p, i) => i === 0 || p.at >= plan[i - 1].at)).toBe(true);
  });

  it('gives each reminder its own stable id', () => {
    expect(reminderId('r:rent:2026-12-01')).toBe(reminderId('r:rent:2026-12-01'));
    expect(reminderId('r:rent:2026-12-01')).not.toBe(reminderId('r:rent:2027-01-01'));
    expect(reminderId('x')).toBeGreaterThan(0);
    expect(reminderId('x')).toBeLessThanOrEqual(0x7fffffff);
  });
});
