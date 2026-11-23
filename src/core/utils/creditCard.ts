import { currenciesOf, groupOf, openingOf, roundTo } from './currency';
import { changeOn } from './lending';
import { parseNumber } from './number';
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

/** The most days after the statement a payment can be due. */
export const MAX_DUE_AFTER = 30;

export interface CardCycle {
  /** The statement before the last one; its cycle ended on `statementOn`. */
  previousStatementOn: Date;
  /** The last statement: everything dated up to the end of this day is on it. */
  statementOn: Date;
  /** When what's on that statement has to be paid. */
  dueOn: Date;
  nextStatementOn: Date;
  /** When what will be on the next statement has to be paid. */
  nextDueOn: Date;
}

/** When a statement made on `statementOn` has to be paid: `dueAfter` days later, or the first `dueDay` after it. */
export function dueOf(statementOn: Date, { dueDay, dueAfter }: CreditCard): Date {
  const y = statementOn.getFullYear();
  const m = statementOn.getMonth();
  if (dueAfter) return new Date(y, m, statementOn.getDate() + dueAfter);
  const sameMonth = dayIn(y, m, dueDay);
  return sameMonth > statementOn ? sameMonth : dayIn(y, m + 1, dueDay);
}

/**
 * The statement cycle `today` is in. The statement is made at the end of its day, so on the statement day
 * itself the previous one is still the latest.
 */
export function cycleOf(credit: CreditCard, today: Date): CardCycle {
  const { statementDay } = credit;
  const now = startOfDay(today);
  const thisMonth = dayIn(now.getFullYear(), now.getMonth(), statementDay);
  const statementOn = thisMonth < now ? thisMonth : dayIn(now.getFullYear(), now.getMonth() - 1, statementDay);
  const y = statementOn.getFullYear();
  const m = statementOn.getMonth();
  const nextStatementOn = dayIn(y, m + 1, statementDay);
  return {
    previousStatementOn: dayIn(y, m - 1, statementDay),
    statementOn,
    dueOn: dueOf(statementOn, credit),
    nextStatementOn,
    nextDueOn: dueOf(nextStatementOn, credit),
  };
}

/** The day of the month the current cycle's payment is due, saved alongside `dueAfter` for older builds. */
export function fixedDueDay(credit: CreditCard, today: Date): number {
  return cycleOf(credit, today).dueOn.getDate();
}

/** A typed whole number of days, in any of the digits the keyboard types; undefined when it isn't one. */
function typedDays(typed: string): number | undefined {
  const n = parseNumber(typed);
  return Number.isInteger(n) ? n : undefined;
}

/** Typed "days after the statement": a whole number from 1 to `MAX_DUE_AFTER`, otherwise undefined. */
export function parseDueAfter(typed: string): number | undefined {
  const n = typedDays(typed);
  return n != null && n >= 1 && n <= MAX_DUE_AFTER ? n : undefined;
}

/** Whether typed "days after" is a whole number above the limit, most likely the bank's total from the day you buy. */
export function dueAfterTooMany(typed: string): boolean {
  return (typedDays(typed) ?? 0) > MAX_DUE_AFTER;
}

export interface InterestFree {
  /** A purchase made today: when it has to be paid, and how many days away that is. */
  today: { payBy: Date; days: number };
  /** The day a purchase gets the longest time before it's due (the day after the next statement). */
  best: { buyOn: Date; payBy: Date; days: number };
}

/** How long purchases go before they're due, as long as each statement is paid in full. */
export function interestFree(credit: CreditCard, today: Date): InterestFree {
  const now = startOfDay(today);
  const { nextStatementOn, nextDueOn } = cycleOf(credit, now);
  const buyOn = nextDay(nextStatementOn);
  const payBy = dueOf(dayIn(nextStatementOn.getFullYear(), nextStatementOn.getMonth() + 1, credit.statementDay), credit);
  return {
    today: { payBy: nextDueOn, days: daysBetween(now, nextDueOn) },
    best: { buyOn, payBy, days: daysBetween(buyOn, payBy) },
  };
}

const newestFirst = (a: Transaction, b: Transaction) =>
  a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date);

/**
 * A card's transactions in this cycle (after the last statement, up to the next one) and in the one before,
 * newest first. Instalments for later statements are left out.
 */
export function cardTransactions(
  cardId: string,
  txs: Transaction[],
  cycle: CardCycle,
): { thisCycle: Transaction[]; lastCycle: Transaction[] } {
  const thisStart = nextDay(cycle.statementOn).getTime();
  const thisEnd = nextDay(cycle.nextStatementOn).getTime();
  const lastStart = nextDay(cycle.previousStatementOn).getTime();
  const thisCycle: Transaction[] = [];
  const lastCycle: Transaction[] = [];
  for (const t of txs) {
    if (t.accountId !== cardId && t.toAccountId !== cardId) continue;
    const at = new Date(t.date).getTime();
    if (at >= thisEnd) continue;
    if (at >= thisStart) thisCycle.push(t);
    else if (at >= lastStart) lastCycle.push(t);
  }
  return { thisCycle: thisCycle.sort(newestFirst), lastCycle: lastCycle.sort(newestFirst) };
}

/** One currency of a credit card. Every amount is what you owe or pay, so never below zero. */
export interface CardAmounts {
  /** Owed right now. */
  owed: number;
  /** Owed when the last statement was made. */
  statement: number;
  /** Money that reached the card since then: payments and refunds. */
  paid: number;
  /** Money that went out of the card since then and up to today: purchases and transfers out. */
  spent: number;
  /** Charges dated after the next statement (instalments for later statements): owed, but not on the next one. */
  later: number;
  /** Instalments dated after today: owed already, charged in the months to come. */
  toCome: number;
  /** What's left to pay of the statement. */
  due: number;
  /** What's left to pay of the minimum payment; undefined when the card has no minimum rule. */
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
  const endOfToday = nextDay(startOfDay(today)).getTime();
  const nextEnd = nextDay(cycle.nextStatementOn).getTime();
  const lastStart = nextDay(cycle.previousStatementOn).getTime();
  /** Instalments billed on the last statement: the minimum payment takes them whole. */
  const billedInstalments: Amounts = {};
  const paid: Amounts = {};
  const spent: Amounts = {};
  const later: Amounts = {};
  const toCome: Amounts = {};
  const add = (into: Amounts, cur: string, v: number) => (into[cur] = roundTo((into[cur] ?? 0) + v, cur));
  for (const t of txs) {
    const at = new Date(t.date).getTime();
    const after = at >= cutoff;
    const exchange = t.type === 'transfer' && t.accountId === id && t.toAccountId === id;
    for (const [delta, cur] of changeOn(t, id)) {
      // Money reaching the card counts on its day; charges count at once, as the bank takes them off the limit.
      if (delta > 0 && !exchange && at >= endOfToday) continue;
      add(balance, cur, delta);
      if (!after) {
        add(atStatement, cur, delta);
        if (t.instalment && delta < 0 && at >= lastStart) add(billedInstalments, cur, -delta);
      } else if (exchange) continue;
      else if (delta > 0) add(paid, cur, delta);
      else {
        if (at < endOfToday) add(spent, cur, -delta);
        else if (t.instalment) add(toCome, cur, -delta);
        if (at >= nextEnd) add(later, cur, -delta);
      }
    }
  }

  const { minPercent, minAmount } = card.credit;
  const withMinimum = hasMinimum(card.credit);
  const byCurrency: Record<string, CardAmounts> = {};
  for (const cur of currenciesOf(card)) {
    const owed = Math.max(0, -(balance[cur] ?? 0));
    const statement = Math.max(0, -(atStatement[cur] ?? 0));
    const p = paid[cur] ?? 0;
    const due = roundTo(Math.min(owed, Math.max(0, statement - p)), cur);
    const amounts: CardAmounts = {
      owed,
      statement,
      paid: p,
      spent: spent[cur] ?? 0,
      later: later[cur] ?? 0,
      toCome: toCome[cur] ?? 0,
      due,
    };
    if (withMinimum) {
      const floor = cur === card.currency ? minAmount ?? 0 : 0;
      // Instalments billed on the statement are due in full; the minimum % applies to the rest.
      const inst = Math.min(statement, billedInstalments[cur] ?? 0);
      const rest = statement - inst;
      const ofRest = rest > 0 ? Math.max(roundTo((rest * (minPercent ?? 0)) / 100, cur), floor) : 0;
      const full = statement ? Math.min(statement, roundTo(inst + ofRest, cur)) : 0;
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

/**
 * Whether a transfer from `from` to `to` takes cash out on a credit card: to an account that isn't a credit card, and
 * isn't a person's debt (a card purchase given to someone, which the bank charges as a purchase).
 */
export function isCashWithdrawal(from: Account | undefined, to: Account | undefined): boolean {
  return !!from && !!to && isCreditCard(from) && !isCreditCard(to) && groupOf(to) !== 'debt' && to.id !== from.id;
}

/**
 * The bank's fee for taking `amount` out on the card, from its rule: the percent, at least the floor (which is in
 * the main currency only). Undefined without a rule or an amount.
 */
export function cashFeeFor(card: Account & { credit: CreditCard }, amount: number, currency: string): number | undefined {
  const { cashFeePercent, cashFeeAmount } = card.credit;
  if ((!cashFeePercent && !cashFeeAmount) || !(amount > 0)) return undefined;
  const floor = currency === card.currency ? cashFeeAmount ?? 0 : 0;
  return Math.max(roundTo((amount * (cashFeePercent ?? 0)) / 100, currency), floor);
}

/** Whether a card has a minimum payment rule. */
export const hasMinimum = (credit: CreditCard): boolean => !!credit.minPercent || !!credit.minAmount;

/** A typed percent above 0 and up to 100, in any of the digits the keyboard types; otherwise undefined. */
export function parsePercent(typed: string): number | undefined {
  const n = parseNumber(typed);
  return n > 0 && n <= 100 ? n : undefined;
}

/** Whether a typed percent is one the card can't take (above 100, or not a number). Empty or 0 means no rule. */
export function percentInvalid(typed: string): boolean {
  return typed.trim() !== '' && parseNumber(typed) !== 0 && parsePercent(typed) === undefined;
}

/**
 * What the card page shows of the minimum: 'row' while some of it is left, 'paid' once it's paid but the
 * statement isn't. Nothing without a rule, or unless the statement is due (overdue, the late fee is charged).
 */
export function minimumLine(status: CardStatus): 'row' | 'paid' | undefined {
  const all = Object.values(status.byCurrency);
  if (status.state !== 'due' || all.some((x) => x.minimum == null)) return undefined;
  return all.some((x) => (x.minimum ?? 0) > 0) ? 'row' : 'paid';
}

/** What the next statement would show if nothing else happens: what's owed, less instalments for later ones. */
export const nextSoFar = (x: CardAmounts) => Math.max(0, x.owed - x.later);

/** A statement still to come, and what will be on it in each of the card's currencies. */
export interface UpcomingStatement {
  statementOn: Date;
  dueOn: Date;
  byCurrency: Amounts;
  /** Money off the card dated in this statement's cycle, oldest first. Exchanges and money in are left out. */
  charges: Transaction[];
  /** The next statement only: what's left of the last statement after payments, per currency (only those above 0). */
  carried?: Amounts;
  /** The next statement only: what was paid or refunded beyond the last statement, per currency (only those above 0). */
  credit?: Amounts;
}

/** The fewest upcoming statements listed, even with nothing charged on them yet. */
export const MIN_UPCOMING = 3;

/**
 * The statements to come, from the next one on to the one holding the card's last charge (at least
 * `MIN_UPCOMING`). The next one shows what it holds so far, unpaid statement included, as `status` does; each
 * later one only the charges dated in its cycle (mostly instalments), as if the one before is paid in full.
 * `status` must be the card's status for the same transactions.
 */
export function upcomingStatements(card: Account & { credit: CreditCard }, txs: Transaction[], status: CardStatus): UpcomingStatement[] {
  const id = card.id!;
  const { credit } = card;
  const currencies = currenciesOf(card);
  const first = status.cycle.nextStatementOn;
  // Every statement counts from the first one's month, so day 31 isn't stuck on the 28th after February.
  const statementAt = (k: number) => dayIn(first.getFullYear(), first.getMonth() + k, credit.statementDay);
  const startOfLater = nextDay(first).getTime();

  /** Index of the statement a charge lands on, counted from the first one. */
  const statementIndex = (at: number) => {
    let k = 1;
    while (nextDay(statementAt(k)).getTime() <= at) k++;
    return k;
  };
  const startOfNext = nextDay(status.cycle.statementOn).getTime();
  const charges: Amounts[] = [];
  /** The transactions behind `charges`, by statement index; index 0 holds this cycle's. */
  const chargeTxs: Transaction[][] = [];
  for (const t of txs) {
    const at = new Date(t.date).getTime();
    if (at < startOfNext) continue;
    if (t.type === 'transfer' && t.accountId === id && t.toAccountId === id) continue;
    const k = at < startOfLater ? 0 : statementIndex(at);
    for (const [delta, cur] of changeOn(t, id)) {
      if (delta >= 0) continue;
      (chargeTxs[k] ??= []).push(t);
      const into = (charges[k] ??= {});
      into[cur] = roundTo((into[cur] ?? 0) - delta, cur);
    }
  }

  const count = Math.max(MIN_UPCOMING, charges.length);
  return Array.from({ length: count }, (_, k) => {
    const statementOn = statementAt(k);
    const byCurrency: Amounts = {};
    for (const cur of currencies) {
      byCurrency[cur] = k === 0 ? nextSoFar(status.byCurrency[cur]) : charges[k]?.[cur] ?? 0;
    }
    const list = (chargeTxs[k] ?? []).sort((a, b) => a.date.localeCompare(b.date));
    const statement: UpcomingStatement = { statementOn, dueOn: dueOf(statementOn, credit), byCurrency, charges: list };
    if (k === 0) {
      // What the next statement holds beyond this cycle's charges: the last statement's unpaid rest.
      const carried: Amounts = {};
      // Or what was paid (or refunded) beyond it, which the next statement takes off this cycle's charges.
      const credit: Amounts = {};
      for (const cur of currencies) {
        const x = status.byCurrency[cur];
        if (!x) continue;
        if (x.due > 0) carried[cur] = x.due;
        const over = roundTo(x.paid - x.statement, cur);
        if (over > 0) credit[cur] = over;
      }
      if (Object.keys(carried).length) statement.carried = carried;
      if (Object.keys(credit).length) statement.credit = credit;
    }
    return statement;
  });
}

/** The statement a charge dated `date` lands on, and when that statement is due. */
export function statementFor(credit: CreditCard, date: Date): { statementOn: Date; dueOn: Date } {
  const { nextStatementOn, nextDueOn } = cycleOf(credit, date);
  return { statementOn: nextStatementOn, dueOn: nextDueOn };
}

/** One instalment plan on a card, as far as it has got. */
export interface InstalmentPlan {
  planId: string;
  /** The plan's earliest entry (instalment 1, or a later one for a plan started before Budgy): its name, category and date. */
  first: Transaction;
  /** How many instalments in all. */
  of: number;
  /** The usual monthly amount (the earliest entry's). */
  monthly: number;
  currency: string;
  /** How many are charged: the ones before the earliest entry, plus those dated up to today. */
  charged: number;
  /** What the ones dated after today add up to. */
  toCome: number;
}

/** The card's instalment plans that still have instalments to come, oldest first. */
export function instalmentPlans(cardId: string, txs: Transaction[], today: Date): InstalmentPlan[] {
  const endOfToday = nextDay(startOfDay(today)).getTime();
  const plans = new Map<string, Transaction[]>();
  for (const t of txs) {
    if (!t.instalment || t.accountId !== cardId) continue;
    const list = plans.get(t.instalment.planId) ?? [];
    list.push(t);
    plans.set(t.instalment.planId, list);
  }
  const out: InstalmentPlan[] = [];
  for (const [planId, list] of plans) {
    list.sort((a, b) => a.instalment!.n - b.instalment!.n);
    const first = list[0];
    const future = list.filter((t) => new Date(t.date).getTime() >= endOfToday);
    if (!future.length) continue;
    out.push({
      planId,
      first,
      of: first.instalment!.of,
      monthly: first.amount,
      currency: first.currency,
      charged: first.instalment!.n - 1 + list.length - future.length,
      toCome: roundTo(future.reduce((s, t) => s + t.amount, 0), first.currency),
    });
  }
  return out.sort((a, b) => a.first.date.localeCompare(b.first.date));
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
