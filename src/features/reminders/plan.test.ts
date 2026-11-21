import { describe, expect, it } from 'vitest';
import { MAX_REMINDERS, planReminders, reminderId, type ReminderTexts } from './plan';
import type { CardAmounts, CardStatus } from '@/core/utils/creditCard';
import type { Account, Recurring } from '@/shared/models';

const texts: ReminderTexts = {
  recurringTitle: (r) => `R ${r.id}`,
  recurringBody: (r) => (r.auto ? 'auto' : 'ask'),
  cardTitle: (a, amounts) => `C ${a.id} ${Object.entries(amounts).map(([c, n]) => `${c}${n}`).join('+')}`,
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
const amounts = (x: Partial<CardAmounts> = {}): CardAmounts => ({ owed: 0, statement: 0, paid: 0, spent: 0, later: 0, toCome: 0, due: 0, ...x });
const status = (state: CardStatus['state'], dueOn: Date, byCurrency: CardStatus['byCurrency'] = {}): CardStatus => ({
  cycle: {
    previousStatementOn: new Date(2026, 9, 25),
    statementOn: new Date(2026, 10, 25),
    dueOn,
    nextStatementOn: new Date(2026, 11, 25),
    nextDueOn: new Date(2027, 0, 20),
  },
  byCurrency,
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
    const left = { EGP: amounts({ owed: 800, due: 800 }) };
    const due = planReminders({ recurring: [], cards: [{ account: visa, status: status('due', new Date(2026, 11, 10), left) }], now, time, texts });
    expect(due.map((p) => [p.at, p.title, p.body, p.to])).toEqual([
      [new Date(2026, 11, 7, 9), 'C visa EGP800', 'in 3', '/cards/visa'],
      [new Date(2026, 11, 10, 9), 'C visa EGP800', 'in 0', '/cards/visa'],
    ]);
    const paid = planReminders({ recurring: [], cards: [{ account: visa, status: status('paid', new Date(2026, 11, 10)) }], now, time, texts });
    expect(paid).toEqual([]);
  });

  it('reminds ahead of the next statement’s due date, for what will be on it', () => {
    // Owes 2,800: 800 left on the last statement, 1,500 for later statements' instalments, so 500 goes on the next.
    const s = status('due', new Date(2026, 11, 10), { EGP: amounts({ owed: 2800, due: 800, later: 1500 }) });
    const next = planReminders({ recurring: [], cards: [{ account: visa, status: s }], now, time, texts }).filter((p) => p.at.getFullYear() === 2027);
    expect(next.map((p) => [p.at, p.title, p.body, p.to])).toEqual([
      [new Date(2027, 0, 17, 9), 'C visa EGP500', 'in 3', '/cards/visa'],
      [new Date(2027, 0, 20, 9), 'C visa EGP500', 'in 0', '/cards/visa'],
    ]);
  });

  it('has nothing for the next statement when nothing will be on it', () => {
    const s = status('paid', new Date(2026, 11, 10), { EGP: amounts({ owed: 1500, later: 1500 }) });
    expect(planReminders({ recurring: [], cards: [{ account: visa, status: s }], now, time, texts })).toEqual([]);
  });

  it('opens the card when an instalment plan’s automatic payment is due', () => {
    const payment: Recurring = {
      ...rent,
      id: 'pay',
      tx: { type: 'transfer', amount: 1000, currency: 'EGP', accountId: 'bank', toAccountId: 'visa' },
      auto: true,
      planId: 'p',
    };
    expect(planReminders({ recurring: [payment], cards: [], now, time, texts })[0].to).toBe('/cards/visa');
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
