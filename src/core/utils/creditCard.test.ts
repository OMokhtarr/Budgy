import { describe, expect, it } from 'vitest';
import {
  cardStatus, cardTransactions, cashFeeFor, cycleOf, dueAfterTooMany, isCashWithdrawal, fixedDueDay, hasMinimum, instalmentPlans, interestFree, minimumLine, needsReminder, nextSoFar,
  parseDueAfter, parsePercent, percentInvalid,
  payFromAccount, statementFor, upcomingStatements,
} from './creditCard';
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

  it('follows each currency of a two-currency card on its own', () => {
    const c = card({ currency2: 'USD' });
    const usd = tx({ type: 'expense', amount: 40, currency: 'USD', date: day(2026, 11, 10).toISOString() });
    const s = cardStatus(c, [usd], today);
    expect(s.byCurrency.USD).toMatchObject({ owed: 40, statement: 40, due: 40 });
    expect(s.byCurrency.EGP).toMatchObject({ owed: 0, due: 0 });
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

const inst = (amount: number, date: Date, n: number, of: number, planId = 'p') =>
  tx({ type: 'expense', amount, date: date.toISOString(), instalment: { planId, n, of } });

describe('instalments on the card', () => {
  const today = day(2026, 11, 28);
  const plan = [1, 2, 3].map((n) => inst(1000, day(2026, 10 + n, 26), n, 3)); // 26 Nov, 26 Dec, 26 Jan

  it('owes the full price at once', () => {
    expect(cardStatus(card(), plan, today).byCurrency.EGP.owed).toBe(3000);
  });

  it('counts only what is dated up to today as spent, and the rest as still to come', () => {
    const s = cardStatus(card(), plan, today).byCurrency.EGP;
    expect(s.spent).toBe(1000);
    expect(s.toCome).toBe(2000);
  });

  it('leaves later statements’ instalments out of the next statement', () => {
    expect(cardStatus(card(), plan, today).byCurrency.EGP.later).toBe(2000); // 26 Dec and 26 Jan land after the 25 Dec statement
  });

  it('bills one instalment per statement', () => {
    expect(cardStatus(card(), plan, day(2026, 12, 28)).byCurrency.EGP.due).toBe(1000); // the 25 Dec statement holds only 26 Nov's
  });

  it('tracks instalments in a second currency on their own', () => {
    const s = cardStatus(
      card({ currency2: 'USD' }),
      [tx({ type: 'expense', amount: 50, currency: 'USD', date: day(2027, 1, 26).toISOString(), instalment: { planId: 'u', n: 2, of: 2 } })],
      today,
    );
    expect(s.byCurrency.USD.toCome).toBe(50);
    expect(s.byCurrency.EGP.toCome).toBe(0);
  });
});

it('statementFor gives the statement a charge lands on, and its due date', () => {
  const s = statementFor(credit(), day(2026, 11, 25));
  expect(ymd(s.statementOn)).toEqual([2026, 11, 25]);
  expect(ymd(s.dueOn)).toEqual([2026, 12, 20]);
  expect(ymd(statementFor(credit(), day(2026, 11, 26)).statementOn)).toEqual([2026, 12, 25]);
});

it('instalmentPlans lists running plans with what is charged and still to come', () => {
  const txs = [1, 2, 3].map((n) => inst(1000, day(2026, 10 + n, 26), n, 3));
  const [p] = instalmentPlans('card', txs, day(2026, 11, 28));
  expect(p).toMatchObject({ planId: 'p', of: 3, monthly: 1000, charged: 1, toCome: 2000, currency: 'EGP' });
  expect(instalmentPlans('card', txs, day(2027, 2, 1))).toEqual([]);
});

it('instalmentPlans counts instalments before the first entry as charged', () => {
  const txs = [3, 4, 5].map((n, k) => inst(1000, day(2026, 11 + k, 26), n, 5)); // 26 Nov, 26 Dec, 26 Jan
  const [p] = instalmentPlans('card', txs, day(2026, 11, 28));
  expect(p).toMatchObject({ of: 5, charged: 3, toCome: 2000 });
});

it('cardTransactions leaves out charges after the next statement', () => {
  const r = cardTransactions('card', [inst(1, day(2026, 11, 27), 1, 2), inst(2, day(2027, 1, 2), 2, 2)], cycleOf(credit(), day(2026, 11, 28)));
  expect(r.thisCycle.map((t) => t.amount)).toEqual([1]);
});

describe('upcomingStatements', () => {
  const today = day(2026, 11, 28); // last statement 25 Nov, next 25 Dec
  const upcoming = (c: Credit, txs: Transaction[], at = today) => upcomingStatements(c, txs, cardStatus(c, txs, at));
  const egp = (list: ReturnType<typeof upcomingStatements>) => list.map((s) => s.byCurrency.EGP);

  it('starts with the next statement so far, then one instalment on each one after', () => {
    const plan = [1, 2, 3].map((n) => inst(1000, day(2026, 10 + n, 26), n, 3)); // 26 Nov, 26 Dec, 26 Jan
    const list = upcoming(card(), [spend(200, day(2026, 11, 27)), ...plan]);
    expect(list.map((s) => ymd(s.statementOn))).toEqual([[2026, 12, 25], [2027, 1, 25], [2027, 2, 25]]);
    expect(list.map((s) => ymd(s.dueOn))).toEqual([[2027, 1, 20], [2027, 2, 20], [2027, 3, 20]]);
    expect(egp(list)).toEqual([1200, 1000, 1000]);
  });

  it('shows the same first figure as "Next statement so far", unpaid statement included', () => {
    const c = card();
    const txs = [spend(500, day(2026, 11, 10)), spend(80, day(2026, 11, 27)), inst(300, day(2027, 1, 26), 2, 2)];
    const s = cardStatus(c, txs, today);
    expect(upcomingStatements(c, txs, s)[0].byCurrency.EGP).toBe(nextSoFar(s.byCurrency.EGP));
    expect(s.byCurrency.EGP.statement).toBe(500);
    expect(upcomingStatements(c, txs, s)[0].byCurrency.EGP).toBe(580);
  });

  it('puts a charge late on the statement day on that statement, and one the day after on the next', () => {
    const list = upcoming(card(), [spend(1, day(2027, 1, 25, 23)), spend(2, day(2027, 1, 26))]);
    expect(egp(list)).toEqual([0, 1, 2]);
  });

  it('shows at least three statements, and runs on to the last charge', () => {
    expect(egp(upcoming(card(), []))).toEqual([0, 0, 0]);
    const plan = [1, 2, 3, 4, 5, 6].map((n) => inst(100, day(2026, 10 + n, 26), n, 6));
    const list = upcoming(card(), plan);
    expect(list).toHaveLength(6);
    expect(ymd(list[5].statementOn)).toEqual([2027, 5, 25]);
  });

  it('adds up to what is owed, later statements holding exactly the later charges', () => {
    const c = card();
    const plan = [1, 2, 3, 4].map((n) => inst(250, day(2026, 10 + n, 26), n, 4));
    const s = cardStatus(c, plan, today);
    const list = upcomingStatements(c, plan, s);
    expect(list.slice(1).reduce((t, x) => t + x.byCurrency.EGP, 0)).toBe(s.byCurrency.EGP.later);
    expect(list.reduce((t, x) => t + x.byCurrency.EGP, 0)).toBe(s.byCurrency.EGP.owed);
  });

  it('leaves payments and exchanges out of a later statement’s charges', () => {
    const txs = [
      spend(40, day(2027, 1, 10)),
      pay(15, day(2027, 1, 11)),
      tx({ type: 'transfer', amount: 10, toAccountId: 'card', toCurrency: 'USD', toAmount: 0.2, date: day(2027, 1, 12).toISOString() }),
    ];
    expect(egp(upcoming(card({ currency2: 'USD' }), txs))[1]).toBe(40);
  });

  it('keeps day 31 on the last day of each month, past February', () => {
    const c = card({ credit: credit({ statementDay: 31, dueAfter: 25 }) });
    const list = upcoming(c, [], day(2027, 1, 5));
    expect(list.map((s) => ymd(s.statementOn))).toEqual([[2027, 1, 31], [2027, 2, 28], [2027, 3, 31]]);
    expect(list.map((s) => ymd(s.dueOn))).toEqual([[2027, 2, 25], [2027, 3, 25], [2027, 4, 25]]);
  });

  it('follows each currency of a two-currency card on its own', () => {
    const usd = tx({ type: 'expense', amount: 50, currency: 'USD', date: day(2027, 1, 26).toISOString(), instalment: { planId: 'u', n: 2, of: 2 } });
    const list = upcoming(card({ currency2: 'USD' }), [usd]);
    expect(list.map((s) => s.byCurrency)).toEqual([{ EGP: 0, USD: 0 }, { EGP: 0, USD: 0 }, { EGP: 0, USD: 50 }]);
  });
});

describe('minimum payment', () => {
  const today = day(2026, 12, 1);
  const rule = (c: Partial<CreditCard>) => card({ credit: credit(c) });
  const status = (c: Partial<CreditCard>, txs: Transaction[], on = today) => cardStatus(rule(c), txs, on);
  const minimum = (c: Partial<CreditCard>, txs: Transaction[]) => status(c, txs).byCurrency.EGP.minimum;

  it('is 5% of the statement', () => {
    expect(minimum({ minPercent: 5 }, [spend(12000, day(2026, 11, 10))])).toBe(600);
  });

  it('is at least the floor', () => {
    expect(minimum({ minPercent: 5, minAmount: 1000 }, [spend(12000, day(2026, 11, 10))])).toBe(1000);
  });

  it('is never more than the statement', () => {
    expect(minimum({ minAmount: 50 }, [spend(30, day(2026, 11, 10))])).toBe(30);
  });

  it('takes the statement’s instalments whole', () => {
    const inst = tx({ type: 'expense', amount: 1000, date: day(2026, 11, 10).toISOString(), instalment: { planId: 'p', n: 2, of: 12 } });
    expect(minimum({ minPercent: 5 }, [inst, spend(2000, day(2026, 11, 10))])).toBe(1100);
  });

  it('counts payments since the statement', () => {
    const buy = spend(12000, day(2026, 11, 10));
    expect(minimum({ minPercent: 5 }, [buy, pay(400, day(2026, 11, 28))])).toBe(200);
    expect(minimum({ minPercent: 5 }, [buy, pay(700, day(2026, 11, 28))])).toBe(0);
  });

  it('is 0 when nothing was owed at the statement', () => {
    expect(minimum({ minPercent: 5 }, [])).toBe(0);
  });

  it('uses the floor in the main currency only', () => {
    const usd = tx({ type: 'expense', amount: 100, currency: 'USD', date: day(2026, 11, 10).toISOString() });
    const s = cardStatus(card({ currency2: 'USD', credit: credit({ minPercent: 5, minAmount: 1000 }) }), [spend(12000, day(2026, 11, 10)), usd], today);
    expect(s.byCurrency.EGP.minimum).toBe(1000);
    expect(s.byCurrency.USD.minimum).toBe(5);
  });

  it('is undefined without a rule', () => {
    expect(hasMinimum(credit())).toBe(false);
    expect(minimum({}, [spend(12000, day(2026, 11, 10))])).toBeUndefined();
  });

  it('reads a typed percent from above 0 up to 100, in any digits', () => {
    expect(parsePercent('5')).toBe(5);
    expect(parsePercent('٥')).toBe(5);
    expect(parsePercent('2.5')).toBe(2.5);
    for (const bad of ['', '0', '101', 'x']) expect(parsePercent(bad)).toBeUndefined();
  });

  it('flags a typed percent it can’t take, but not an empty one or 0 (no rule)', () => {
    for (const bad of ['150', '101', 'x']) expect(percentInvalid(bad)).toBe(true);
    for (const ok of ['', '0', '5', '٥']) expect(percentInvalid(ok)).toBe(false);
  });

  it('shows a row while some of the minimum is left, and that it is paid once it is', () => {
    const buy = spend(12000, day(2026, 11, 10));
    expect(minimumLine(status({ minPercent: 5 }, [buy]))).toBe('row');
    expect(minimumLine(status({ minPercent: 5 }, [buy, pay(700, day(2026, 11, 28))]))).toBe('paid');
  });

  it('shows nothing once the card is overdue, or without a rule', () => {
    const buy = spend(12000, day(2026, 11, 10));
    expect(minimumLine(status({ minPercent: 5 }, [buy], day(2026, 12, 22)))).toBeUndefined();
    expect(minimumLine(status({}, [buy]))).toBeUndefined();
  });
});

describe('cash withdrawals', () => {
  const plain = (id: string, type: Account['type']): Account => ({ ...card({ id, type }), credit: undefined });
  const cash = plain('cash', 'cash');
  const bank = plain('bank', 'bank');
  const debit = plain('debit', 'card');
  const other = card({ id: 'other' });

  it('counts a transfer from a credit card to an account that isn’t one', () => {
    expect(isCashWithdrawal(card(), cash)).toBe(true);
    expect(isCashWithdrawal(card(), bank)).toBe(true);
    expect(isCashWithdrawal(card(), debit)).toBe(true);
  });

  it('doesn’t count other transfers', () => {
    expect(isCashWithdrawal(card(), other)).toBe(false);
    expect(isCashWithdrawal(card(), card())).toBe(false);
    expect(isCashWithdrawal(debit, cash)).toBe(false);
    expect(isCashWithdrawal(bank, card())).toBe(false);
    expect(isCashWithdrawal(card(), undefined)).toBe(false);
    expect(isCashWithdrawal(undefined, cash)).toBe(false);
  });

  it('doesn’t count a card purchase given to a person', () => {
    expect(isCashWithdrawal(card(), { ...plain('ahmed', 'cash'), group: 'debt' })).toBe(false);
  });

  it('works out the fee from the card’s rule, floor included', () => {
    expect(cashFeeFor(card({ credit: credit({ cashFeePercent: 2 }) }), 1000, 'EGP')).toBe(20);
    const floored = card({ currency2: 'USD', credit: credit({ cashFeePercent: 2, cashFeeAmount: 20 }) });
    expect(cashFeeFor(floored, 300, 'EGP')).toBe(20);
    expect(cashFeeFor(floored, 300, 'USD')).toBe(6);
  });

  it('has no fee without a rule or an amount', () => {
    expect(cashFeeFor(card(), 1000, 'EGP')).toBeUndefined();
    expect(cashFeeFor(card({ credit: credit({ cashFeePercent: 2 }) }), 0, 'EGP')).toBeUndefined();
  });
});
