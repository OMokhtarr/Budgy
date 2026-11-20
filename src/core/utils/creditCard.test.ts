import { describe, expect, it } from 'vitest';
import { cardStatus, cardTransactions, cycleOf, dueAfterTooMany, fixedDueDay, interestFree, needsReminder, parseDueAfter, payFromAccount } from './creditCard';
import type { Account, CreditCard, Transaction } from '@/shared/models';

const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);
const ymd = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate()];

const credit = (c: Partial<CreditCard> = {}): CreditCard => ({ statementDay: 25, dueDay: 20, ...c });

type Credit = Account & { credit: CreditCard };
const card = (over: Partial<Account> = {}): Credit => ({
  id: 'card',
  name: 'Visa',
  type: 'card',
  icon: 'card',
  color: '#000',
  currency: 'EGP',
  initialBalance: 0,
  order: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  credit: credit(),
  ...over,
});

let n = 0;
const tx = (t: Partial<Transaction> & Pick<Transaction, 'type' | 'amount' | 'date'>): Transaction => ({
  id: `t${++n}`,
  currency: 'EGP',
  accountId: 'card',
  createdAt: t.date,
  ...t,
});
const spend = (amount: number, date: Date) => tx({ type: 'expense', amount, date: date.toISOString() });
const pay = (amount: number, date: Date) => tx({ type: 'transfer', amount, accountId: 'bank', toAccountId: 'card', date: date.toISOString() });

describe('cycleOf', () => {
  it('uses this month’s statement once its day has passed', () => {
    const c = cycleOf(credit(), day(2026, 11, 28));
    expect(ymd(c.statementOn)).toEqual([2026, 11, 25]);
    expect(ymd(c.dueOn)).toEqual([2026, 12, 20]);
    expect(ymd(c.nextStatementOn)).toEqual([2026, 12, 25]);
  });

  it('keeps the previous statement on the statement day itself', () => {
    expect(ymd(cycleOf(credit(), day(2026, 11, 25)).statementOn)).toEqual([2026, 10, 25]);
  });

  it('puts the due date in the same month when it comes after the statement day', () => {
    const c = cycleOf(credit({ statementDay: 1, dueDay: 25 }), day(2026, 11, 10));
    expect(ymd(c.statementOn)).toEqual([2026, 11, 1]);
    expect(ymd(c.dueOn)).toEqual([2026, 11, 25]);
  });

  it('uses the last day of a shorter month', () => {
    const c = cycleOf(credit({ statementDay: 31, dueDay: 30 }), day(2026, 3, 5));
    expect(ymd(c.statementOn)).toEqual([2026, 2, 28]);
    expect(ymd(c.dueOn)).toEqual([2026, 3, 30]);
    expect(ymd(c.nextStatementOn)).toEqual([2026, 3, 31]);
  });

  it('crosses the year', () => {
    const c = cycleOf(credit(), day(2027, 1, 3));
    expect(ymd(c.statementOn)).toEqual([2026, 12, 25]);
    expect(ymd(c.dueOn)).toEqual([2027, 1, 20]);
  });
});

describe('cardStatus', () => {
  const today = day(2026, 11, 28);

  it('splits what was on the statement from what was spent after it', () => {
    const s = cardStatus(card(), [spend(1000, day(2026, 11, 10)), spend(300, day(2026, 11, 25, 23)), spend(200, day(2026, 11, 27))], today);
    expect(s.byCurrency.EGP).toMatchObject({ owed: 1500, statement: 1300, paid: 0, due: 1300 });
    expect(s.state).toBe('due');
    expect(s.daysLeft).toBe(22);
  });

  it('takes payments made after the statement off what is due', () => {
    const s = cardStatus(card(), [spend(1000, day(2026, 11, 10)), pay(400, day(2026, 11, 27))], today);
    expect(s.byCurrency.EGP).toMatchObject({ owed: 600, statement: 1000, paid: 400, due: 600 });
  });

  it('is paid once the statement is covered, even with new spending', () => {
    const s = cardStatus(card(), [spend(1000, day(2026, 11, 10)), pay(1000, day(2026, 11, 26)), spend(50, day(2026, 11, 27))], today);
    expect(s.byCurrency.EGP.due).toBe(0);
    expect(s.state).toBe('paid');
  });

  it('never asks for more than is owed now, e.g. after a refund', () => {
    const refund = tx({ type: 'income', amount: 900, date: day(2026, 11, 27).toISOString() });
    const s = cardStatus(card(), [spend(1000, day(2026, 11, 10)), refund], today);
    expect(s.byCurrency.EGP).toMatchObject({ owed: 100, due: 100 });
  });

  it('counts the opening balance as part of the statement', () => {
    const s = cardStatus(card({ initialBalance: -2000, createdAt: day(2026, 11, 27).toISOString() }), [], today);
    expect(s.byCurrency.EGP).toMatchObject({ owed: 2000, statement: 2000, due: 2000 });
  });

  it('is clear when nothing was owed at the statement', () => {
    const s = cardStatus(card(), [spend(100, day(2026, 11, 27))], today);
    expect(s.state).toBe('clear');
  });

  it('is overdue after the due date', () => {
    const s = cardStatus(card(), [spend(1000, day(2026, 10, 10))], day(2026, 11, 22));
    expect(s.state).toBe('overdue');
    expect(s.daysLeft).toBe(-2);
  });

  it('works out the minimum as a percent with a floor, less what was paid', () => {
    const c = card({ credit: credit({ minPercent: 5, minAmount: 100 }) });
    expect(cardStatus(c, [spend(10000, day(2026, 11, 10))], today).byCurrency.EGP.minimum).toBe(500);
    expect(cardStatus(c, [spend(1000, day(2026, 11, 10))], today).byCurrency.EGP.minimum).toBe(100);
    expect(cardStatus(c, [spend(60, day(2026, 11, 10))], today).byCurrency.EGP.minimum).toBe(60);
    expect(cardStatus(c, [spend(10000, day(2026, 11, 10)), pay(300, day(2026, 11, 27))], today).byCurrency.EGP.minimum).toBe(200);
  });

  it('has no minimum when none is set', () => {
    expect(cardStatus(card(), [spend(1000, day(2026, 11, 10))], today).byCurrency.EGP.minimum).toBeUndefined();
  });

  it('follows each currency of a two-currency card on its own, the floor in the main one only', () => {
    const c = card({ currency2: 'USD', credit: credit({ minPercent: 5, minAmount: 100 }) });
    const usd = tx({ type: 'expense', amount: 40, currency: 'USD', date: day(2026, 11, 10).toISOString() });
    const s = cardStatus(c, [usd], today);
    expect(s.byCurrency.USD).toMatchObject({ owed: 40, statement: 40, due: 40, minimum: 2 });
    expect(s.byCurrency.EGP).toMatchObject({ owed: 0, due: 0, minimum: 0 });
  });

  it('ignores exchanges inside the card when adding up payments', () => {
    const c = card({ currency2: 'USD' });
    const exchange = tx({ type: 'transfer', amount: 500, toAccountId: 'card', toAmount: 10, toCurrency: 'USD', date: day(2026, 11, 27).toISOString() });
    const s = cardStatus(c, [spend(1000, day(2026, 11, 10)), exchange], today);
    expect(s.byCurrency.USD.paid).toBe(0);
  });
});

describe('needsReminder', () => {
  const today = day(2026, 11, 28);
  it.each<[string, Date, boolean]>([
    ['due well ahead', day(2026, 11, 28), false],
    ['due in 5 days', day(2026, 12, 15), true],
    ['overdue', day(2026, 12, 21), true],
  ])('%s', (_name, when, want) => {
    expect(needsReminder(cardStatus(card(), [spend(1000, day(2026, 11, 10))], when))).toBe(want);
  });

  it('not once paid', () => {
    expect(needsReminder(cardStatus(card(), [spend(10, day(2026, 11, 10)), pay(10, today)], day(2026, 12, 19)))).toBe(false);
  });
});

describe('payFromAccount', () => {
  const acc = (id: string, over: Partial<Account> = {}): Account => {
    const { credit: _credit, ...rest } = card({ id, type: 'bank' });
    return { ...rest, ...over };
  };
  const visa = card();

  it('prefers the last used account when it can pay', () => {
    expect(payFromAccount([visa, acc('a'), acc('b')], visa, 'b')).toBe('b');
  });

  it('skips the card itself, other credit cards, debts and other currencies', () => {
    const list = [visa, card({ id: 'mc' }), acc('loan', { group: 'debt' }), acc('usd', { currency: 'USD' }), acc('cash', { type: 'cash' })];
    expect(payFromAccount(list, visa, 'mc')).toBe('cash');
  });

  it('prefers a bank', () => {
    expect(payFromAccount([visa, acc('cash', { type: 'cash' }), acc('bank')], visa, undefined)).toBe('bank');
  });

  it('falls back to any account that can pay', () => {
    expect(payFromAccount([visa, acc('usd', { currency: 'USD' })], visa, undefined)).toBe('usd');
  });
});

describe('due days after the statement', () => {
  it('counts the due date from the statement', () => {
    const c = cycleOf(credit({ statementDay: 5, dueAfter: 25 }), day(2026, 11, 21));
    expect(ymd(c.previousStatementOn)).toEqual([2026, 10, 5]);
    expect(ymd(c.statementOn)).toEqual([2026, 11, 5]);
    expect(ymd(c.dueOn)).toEqual([2026, 11, 30]);
    expect(ymd(c.nextStatementOn)).toEqual([2026, 12, 5]);
    expect(ymd(c.nextDueOn)).toEqual([2026, 12, 30]);
  });

  it('wins over the due day', () => {
    expect(ymd(cycleOf(credit({ statementDay: 5, dueDay: 3, dueAfter: 25 }), day(2026, 11, 21)).dueOn)).toEqual([2026, 11, 30]);
  });

  it('crosses into the next month', () => {
    expect(ymd(cycleOf(credit({ statementDay: 25, dueAfter: 25 }), day(2026, 10, 28)).dueOn)).toEqual([2026, 11, 19]);
  });

  it('counts days after from the last day of a short month', () => {
    const c = cycleOf(credit({ statementDay: 31, dueAfter: 25 }), day(2026, 3, 5));
    expect(ymd(c.statementOn)).toEqual([2026, 2, 28]);
    expect(ymd(c.dueOn)).toEqual([2026, 3, 25]);
  });
});

it('gives the next statement’s due date for a due day too', () => {
  expect(ymd(cycleOf(credit(), day(2026, 11, 28)).nextDueOn)).toEqual([2027, 1, 20]);
});

describe('spent', () => {
  // The statement is on 25 Nov (the default), today is 28 Nov.
  it('adds up money going out of the card since the statement, not payments or exchanges', () => {
    const txs = [
      spend(50, day(2026, 11, 20)),
      spend(100, day(2026, 11, 26)),
      tx({ type: 'transfer', amount: 20, toAccountId: 'bank', date: day(2026, 11, 27).toISOString() }),
      tx({ type: 'transfer', amount: 10, toAccountId: 'card', toCurrency: 'USD', toAmount: 0.2, date: day(2026, 11, 27).toISOString() }),
      pay(30, day(2026, 11, 27)),
    ];
    expect(cardStatus(card(), txs, day(2026, 11, 28)).byCurrency.EGP.spent).toBe(120);
  });

  it('tracks spending in each currency', () => {
    const s = cardStatus(
      card({ currency2: 'USD' }),
      [tx({ type: 'expense', amount: 7, currency: 'USD', date: day(2026, 11, 26).toISOString() })],
      day(2026, 11, 28),
    );
    expect(s.byCurrency.USD.spent).toBe(7);
    expect(s.byCurrency.EGP.spent).toBe(0);
  });
});

describe('interestFree', () => {
  const c = credit({ statementDay: 5, dueAfter: 25 });

  it('says when something bought today is due, and the best day to buy', () => {
    const f = interestFree(c, day(2026, 11, 21));
    expect(ymd(f.today.payBy)).toEqual([2026, 12, 30]);
    expect(f.today.days).toBe(39);
    expect(ymd(f.best.buyOn)).toEqual([2026, 12, 6]);
    expect(ymd(f.best.payBy)).toEqual([2027, 1, 30]);
    expect(f.best.days).toBe(55);
  });

  it('puts a purchase on the statement day on that statement', () => {
    const f = interestFree(c, day(2026, 12, 5));
    expect(ymd(f.today.payBy)).toEqual([2026, 12, 30]);
    expect(f.today.days).toBe(25);
  });
});

it('fixedDueDay is the current due date’s day of the month', () => {
  expect(fixedDueDay(credit({ statementDay: 5, dueAfter: 25 }), day(2026, 11, 21))).toBe(30);
});

it('parseDueAfter takes whole numbers from 1 to 30 only', () => {
  expect(parseDueAfter('25')).toBe(25);
  expect(parseDueAfter('30')).toBe(30);
  for (const bad of ['', '0', '31', '55', '2.5', 'abc']) expect(parseDueAfter(bad)).toBeUndefined();
});

it('cardTransactions splits this cycle from the last one, newest first, this card only', () => {
  const cyc = cycleOf(credit(), day(2026, 11, 28)); // last cycle 26 Oct–25 Nov, this one from 26 Nov
  const r = cardTransactions(
    'card',
    [
      spend(1, day(2026, 10, 20)),
      spend(2, day(2026, 11, 1)),
      spend(3, day(2026, 11, 25, 23)),
      pay(4, day(2026, 11, 26)),
      spend(5, day(2026, 11, 27)),
      tx({ type: 'expense', amount: 6, accountId: 'bank', date: day(2026, 11, 27).toISOString() }),
    ],
    cyc,
  );
  expect(r.thisCycle.map((t) => t.amount)).toEqual([5, 4]);
  expect(r.lastCycle.map((t) => t.amount)).toEqual([3, 2]);
});

it('parseDueAfter reads Arabic-Indic and Persian digits', () => {
  expect(parseDueAfter('٢٥')).toBe(25);
  expect(parseDueAfter('۲۵')).toBe(25);
  expect(parseDueAfter('٢٫٥')).toBeUndefined();
});

it('dueAfterTooMany flags a whole number above 30, in any digits', () => {
  expect(dueAfterTooMany('55')).toBe(true);
  expect(dueAfterTooMany('٥٥')).toBe(true);
  for (const fine of ['', '0', '25', '30', '2.5']) expect(dueAfterTooMany(fine)).toBe(false);
});
