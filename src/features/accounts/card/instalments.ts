import { alive, db, softDelete, type BudgyDB } from '@/core/db/db';
import { statementFor } from '@/core/utils/creditCard';
import { decimalsOf, roundTo } from '@/core/utils/currency';
import { newId } from '@/core/utils/id';
import { parseNumber } from '@/core/utils/number';
import { dayKey } from '@/core/utils/period';
import type { CreditCard, Recurring, Transaction } from '@/shared/models';

/** How a purchase is split, as chosen in the editor. */
export interface PlanOptions {
  months: number;
  /** One-time fee the bank charges for the plan, in the purchase's currency. */
  fee?: number;
  /** Where the fee goes (Bills). */
  feeCategoryId?: string;
  /** The fee's note, e.g. "Instalment fee · Phone". */
  feeNote: string;
  /** Pay each instalment automatically from this account, on each statement's due date. */
  autoPayFrom?: string;
  credit: CreditCard;
}

export const MIN_MONTHS = 2;
export const MAX_MONTHS = 60;

/** Typed months: a whole number from MIN_MONTHS to MAX_MONTHS, in any digits the keyboard types. */
export function parseMonths(typed: string): number | undefined {
  const n = parseNumber(typed);
  return Number.isInteger(n) && n >= MIN_MONTHS && n <= MAX_MONTHS ? n : undefined;
}

/**
 * `total` in `n` parts in the currency's smallest unit, adding up exactly: equal parts, and what's left over goes one
 * unit at a time onto the last ones (1,000 in 3 → 333.33, 333.33, 333.34). No part is ever negative.
 */
export function splitAmount(total: number, n: number, currency: string): number[] {
  const scale = 10 ** decimalsOf(currency);
  const units = Math.round(total * scale);
  const base = Math.floor(units / n);
  const extra = units - base * n;
  return Array.from({ length: n }, (_, k) => roundTo((base + (k >= n - extra ? 1 : 0)) / scale, currency));
}

/**
 * The date-times of `n` monthly instalments, the first on `firstIso`: the same time of day, each counted from the
 * first so a short month doesn't move later ones (31 Jan → 28 Feb → 31 Mar).
 */
export function instalmentDates(firstIso: string, n: number): string[] {
  const d = new Date(firstIso);
  return Array.from({ length: n }, (_, k) => {
    const last = new Date(d.getFullYear(), d.getMonth() + k + 1, 0).getDate();
    const at = new Date(d);
    at.setDate(1);
    at.setMonth(d.getMonth() + k);
    at.setDate(Math.min(d.getDate(), last));
    return at.toISOString();
  });
}

const stamp = () => new Date().toISOString();

/** Instalments 2..N, the fee, and the automatic payment of a plan whose instalment 1 is `first`. */
async function addRest(first: Transaction | Omit<Transaction, 'id'>, planId: string, parts: number[], o: PlanOptions, database: BudgyDB) {
  const dates = instalmentDates(first.date, o.months);
  const now = stamp();
  // One instalment per month, copied from the purchase (not its id or sync state); only the first keeps the bank
  // text it came from.
  const { id: _id, dirty: _dirty, deletedAt: _deleted, ...base } = first as Transaction;
  const rest = parts.slice(1).map((amount, i): Omit<Transaction, 'id'> => ({
    ...base,
    amount,
    date: dates[i + 1],
    smsFingerprint: undefined,
    instalment: { planId, n: i + 2, of: o.months },
    createdAt: now,
    updatedAt: now,
  }));
  if (rest.length) await database.transactions.bulkAdd(rest as Transaction[]);
  if (o.fee && o.fee > 0) {
    await database.transactions.add({
      type: 'expense',
      amount: roundTo(o.fee, first.currency),
      currency: first.currency,
      accountId: first.accountId,
      categoryId: o.feeCategoryId,
      note: o.feeNote || undefined,
      date: first.date,
      rate: first.rate,
      rateCurrency: first.rateCurrency,
      createdAt: now,
      updatedAt: now,
    } as Transaction);
  }
  if (o.autoPayFrom) {
    for (const payment of paymentRules(first, planId, parts, dates, o, now)) await database.recurring.add(payment);
  }
}

/** `day` of a month, or the month's last day if it's shorter. */
const dayIn = (year: number, month: number, day: number) => new Date(year, month, Math.min(day, new Date(year, month + 1, 0).getDate()));

/**
 * The automatic payments of a plan, as monthly rules the app adds by itself on their day. Each instalment is paid in
 * the month its statement is due, on the earliest due day of the plan, so no payment comes after its due date even
 * when "days after the statement" moves the due day. Instalments of different amounts (the last one taking the
 * rounding) get a rule each, so every instalment is paid exactly.
 */
function paymentRules(
  first: Transaction | Omit<Transaction, 'id'>,
  planId: string,
  parts: number[],
  dates: string[],
  o: PlanOptions,
  createdAt: string,
): Recurring[] {
  const dues = dates.map((d) => statementFor(o.credit, new Date(d)).dueOn);
  const day = Math.min(...dues.map((d) => d.getDate()));
  const payDay = (k: number) => dayKey(dayIn(dues[0].getFullYear(), dues[0].getMonth() + k, day));
  const rules: Recurring[] = [];
  for (let k = 0; k < parts.length; ) {
    let j = k;
    while (j + 1 < parts.length && parts[j + 1] === parts[k]) j++;
    rules.push({
      tx: { type: 'transfer', amount: parts[k], currency: first.currency, accountId: o.autoPayFrom!, toAccountId: first.accountId },
      unit: 'month',
      every: 1,
      start: payDay(k),
      next: payDay(k),
      until: payDay(j),
      auto: true,
      planId,
      createdAt,
    });
    k = j + 1;
  }
  return rules;
}

/**
 * Saves a new purchase on a credit card as a plan of monthly instalments; returns instalment 1. A purchase from a bank
 * text is saved once, like `saveTx`: if one with its fingerprint exists (even deleted), that one is returned instead.
 */
export async function createPlan(purchase: Omit<Transaction, 'id'>, o: PlanOptions, database: BudgyDB = db): Promise<Transaction> {
  const planId = newId();
  const parts = splitAmount(purchase.amount, o.months, purchase.currency);
  return database.transaction('rw', database.transactions, database.recurring, async () => {
    const fingerprint = purchase.smsFingerprint;
    const existing = fingerprint ? await database.transactions.where('smsFingerprint').equals(fingerprint).first() : undefined;
    if (existing) return existing;
    const now = stamp();
    const first: Omit<Transaction, 'id'> = {
      ...purchase,
      amount: parts[0],
      instalment: { planId, n: 1, of: o.months },
      createdAt: purchase.createdAt ?? now,
      updatedAt: now,
    };
    const id = (await database.transactions.add(first as Transaction)) as string;
    await addRest(first, planId, parts, o, database);
    return { ...first, id };
  });
}

/** Turns a saved purchase into a plan: it becomes instalment 1 (same id and date), and the rest are added. */
export async function convertToPlan(tx: Transaction, o: PlanOptions, database: BudgyDB = db): Promise<string> {
  const planId = newId();
  const parts = splitAmount(tx.amount, o.months, tx.currency);
  return database.transaction('rw', database.transactions, database.recurring, async () => {
    const first: Transaction = { ...tx, amount: parts[0], instalment: { planId, n: 1, of: o.months }, updatedAt: stamp() };
    await database.transactions.put(first);
    await addRest(first, planId, parts, o, database);
    return planId;
  });
}

const planRows = async (planId: string, database: BudgyDB) =>
  database.transactions.filter((t) => alive(t) && t.instalment?.planId === planId).toArray();

/** Stops a plan's automatic payment, if it has one. */
async function stopPayment(planId: string, database: BudgyDB) {
  const ids = (await database.recurring.filter((r) => alive(r) && r.planId === planId).toArray()).map((r) => r.id!);
  await softDelete(database.recurring, ids);
}

/**
 * Settles a plan early: every instalment still to come is moved to `now`, so it goes on the next statement, and its
 * automatic payment stops. Returns how many moved.
 */
export async function payOffPlan(planId: string, now: Date, database: BudgyDB = db): Promise<number> {
  return database.transaction('rw', database.transactions, database.recurring, async () => {
    const at = now.toISOString();
    const later = (await planRows(planId, database)).filter((t) => t.date > at);
    for (const t of later) await database.transactions.update(t.id!, { date: at });
    await stopPayment(planId, database);
    return later.length;
  });
}

/** Deletes every instalment of a plan (for one entered by mistake) and its automatic payment. Returns how many. */
export async function deletePlan(planId: string, database: BudgyDB = db): Promise<number> {
  return database.transaction('rw', database.transactions, database.recurring, async () => {
    const ids = (await planRows(planId, database)).map((t) => t.id!);
    await softDelete(database.transactions, ids);
    await stopPayment(planId, database);
    return ids.length;
  });
}
