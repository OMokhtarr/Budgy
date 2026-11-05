import type { Transaction } from '@/shared/models';
import { roundTo } from './currency';

/** The part of the app's converter that values money in the main currency. */
export interface BaseConverter {
  base: string;
  toBase: (n: number, cur: string) => number;
}

/**
 * Which way to read a rate between two currencies, as [unit, quote] in "1 unit = X quote".
 * The main currency is always the quote, so 1 USD = 50 EGP reads the same whichever way money moves.
 */
export function rateDirection(from: string, to: string, base: string): [unit: string, quote: string] {
  return from === base ? [to, from] : [from, to];
}

/** What arrives when `amount` of `from` is exchanged into `to` at a rate read as "1 unit = rate". */
export function receivedAt(amount: number, rate: number, from: string, to: string, unit: string): number {
  return roundTo(unit === from ? amount * rate : amount / rate, to);
}

/** The rate that two amounts of an exchange come to, read as "1 unit = rate". */
export function impliedRate(sent: number, received: number, from: string, unit: string): number | undefined {
  if (!(sent > 0) || !(received > 0)) return undefined;
  return unit === from ? received / sent : sent / received;
}

/** A rate as text: six significant digits are plenty, and division noise is dropped. */
export function formatRate(rate: number): string {
  return String(Number(rate.toPrecision(6)));
}

/**
 * An expense or income in the main currency: at its own rate if it has one, otherwise at today's.
 * The rate's currency is usually the main one, and is converted if the main currency has changed since.
 */
export function txInBase(t: Transaction, conv: BaseConverter): number {
  if (t.currency === conv.base || !t.rate || !t.rateCurrency) return conv.toBase(t.amount, t.currency);
  return conv.toBase(roundTo(t.amount * t.rate, t.rateCurrency), t.rateCurrency);
}

interface RateChoice {
  /** The rate the user typed, if any. */
  typed?: number;
  /** Today's saved rate of `currency` against the main one, if any. */
  saved?: number;
  /** The transaction being edited, if any. */
  editing?: Transaction;
  currency: string;
  base: string;
}

/** The rate an expense or income should be saved with. */
export function rateToSave({ typed, saved, editing, currency, base }: RateChoice): Pick<Transaction, 'rate' | 'rateCurrency'> {
  if (currency === base) return {};
  const same = editing?.currency === currency ? editing : undefined;
  const rateCurrency = same?.rateCurrency ?? base;
  if (typed) return { rate: typed, rateCurrency };
  if (same) return same.rate ? { rate: same.rate, rateCurrency } : {};
  return saved ? { rate: saved, rateCurrency } : {};
}
