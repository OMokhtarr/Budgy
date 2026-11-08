import { describe, expect, it } from 'vitest';
import { cardStatus, cycleOf, needsReminder, payFromAccount } from './creditCard';
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
