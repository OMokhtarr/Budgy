import { currenciesOf, groupOf, openingOf, roundTo } from './currency';
import { changeOn } from './lending';
import type { Account, Amounts, CreditCard, Transaction } from '@/shared/models';

/** A reminder shows from this many days before the due date. */
export const REMIND_DAYS = 5;

/** Whether an account is a credit card (a card without credit details is a debit card). */
export const isCreditCard = (a: Account): a is Account & { credit: CreditCard } => a.type === 'card' && !!a.credit;

/** `day` of a month, or the month's last day if it's shorter. Midnight, local time. */
function dayIn(year: number, month: number, day: number): Date {
  const last = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, last));
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const nextDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
const daysBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / 86400000);

export interface CardCycle {
  /** The last statement: everything dated up to the end of this day is on it. */
  statementOn: Date;
  /** When what's on that statement has to be paid. */
  dueOn: Date;
  nextStatementOn: Date;
}

/**
 * The statement cycle `today` is in. The statement is made at the end of its day, so on the statement day
 * itself the previous one is still the latest.
 */
export function cycleOf({ statementDay, dueDay }: CreditCard, today: Date): CardCycle {
  const now = startOfDay(today);
  const thisMonth = dayIn(now.getFullYear(), now.getMonth(), statementDay);
  const statementOn = thisMonth < now ? thisMonth : dayIn(now.getFullYear(), now.getMonth() - 1, statementDay);
  const y = statementOn.getFullYear();
  const m = statementOn.getMonth();
  const sameMonth = dayIn(y, m, dueDay);
  return {
    statementOn,
    dueOn: sameMonth > statementOn ? sameMonth : dayIn(y, m + 1, dueDay),
    nextStatementOn: dayIn(y, m + 1, statementDay),
  };
}

/** One currency of a credit card. Every amount is what you owe or pay, so never below zero. */
export interface CardAmounts {
  /** Owed right now. */
  owed: number;
  /** Owed when the last statement was made. */
  statement: number;
  /** Money that reached the card since then: payments and refunds. */
  paid: number;
  /** What's left to pay of the statement. */
  due: number;
  /** What's left to pay of the minimum payment; undefined when the card has no minimum set. */
  minimum?: number;
}

export type CardState = 'clear' | 'paid' | 'due' | 'overdue';

export interface CardStatus {
  cycle: CardCycle;
  byCurrency: Record<string, CardAmounts>;
  /**
   * 'clear' = nothing was owed at the statement, 'paid' = the statement is paid off, 'due' = some of it is
   * still to pay, 'overdue' = and the due date has passed.
   */
  state: CardState;
  /** Days from today to the due date: 0 on the day, negative once it has passed. */
  daysLeft: number;
}

/**
 * Where a credit card stands in its cycle. The opening balance counts as before the statement, so a card
 * set up mid-cycle treats what it owed as already on the statement. `txs` may include other accounts'.
 */
export function cardStatus(card: Account & { credit: CreditCard }, txs: Transaction[], today: Date): CardStatus {
  const cycle = cycleOf(card.credit, today);
  const cutoff = nextDay(cycle.statementOn).getTime();
  const id = card.id!;
  const balance: Amounts = openingOf(card);
  const atStatement: Amounts = { ...balance };
  const paid: Amounts = {};
  for (const t of txs) {
    const after = new Date(t.date).getTime() >= cutoff;
    const exchange = t.type === 'transfer' && t.accountId === id && t.toAccountId === id;
    for (const [delta, cur] of changeOn(t, id)) {
      balance[cur] = roundTo((balance[cur] ?? 0) + delta, cur);
      if (!after) atStatement[cur] = roundTo((atStatement[cur] ?? 0) + delta, cur);
      else if (delta > 0 && !exchange) paid[cur] = roundTo((paid[cur] ?? 0) + delta, cur);
    }
  }

  const { minPercent, minAmount } = card.credit;
  const hasMinimum = !!minPercent || !!minAmount;
  const byCurrency: Record<string, CardAmounts> = {};
  for (const cur of currenciesOf(card)) {
    const owed = Math.max(0, -(balance[cur] ?? 0));
    const statement = Math.max(0, -(atStatement[cur] ?? 0));
    const p = paid[cur] ?? 0;
    const due = roundTo(Math.min(owed, Math.max(0, statement - p)), cur);
    const amounts: CardAmounts = { owed, statement, paid: p, due };
    if (hasMinimum) {
      const floor = cur === card.currency ? minAmount ?? 0 : 0;
      const full = statement ? Math.min(statement, Math.max(roundTo((statement * (minPercent ?? 0)) / 100, cur), floor)) : 0;
      amounts.minimum = roundTo(Math.min(due, Math.max(0, full - p)), cur);
    }
    byCurrency[cur] = amounts;
  }

  const all = Object.values(byCurrency);
  const daysLeft = daysBetween(startOfDay(today), cycle.dueOn);
  const state: CardState = all.some((x) => x.due > 0)
    ? daysLeft < 0 ? 'overdue' : 'due'
    : all.some((x) => x.statement > 0) ? 'paid' : 'clear';
  return { cycle, byCurrency, state, daysLeft };
}

/** Whether to remind about a card: overdue, or due within `REMIND_DAYS`. */
export function needsReminder(s: CardStatus): boolean {
  return s.state === 'overdue' || (s.state === 'due' && s.daysLeft <= REMIND_DAYS);
}

/**
 * The account a card payment starts from: the last used one if it can pay, otherwise an everyday account in
 * the card's currency (banks first), otherwise any account that can pay. Credit cards and debts can't.
 */
export function payFromAccount(accounts: Account[], card: Account, lastId: string | undefined): string | undefined {
  const canPay = accounts.filter((a) => a.id !== card.id && !a.archived && !isCreditCard(a) && groupOf(a) !== 'debt');
  const holds = canPay.filter((a) => currenciesOf(a).includes(card.currency));
  const last = holds.find((a) => a.id === lastId);
  return (last ?? holds.find((a) => a.type === 'bank') ?? holds[0] ?? canPay[0])?.id;
}
