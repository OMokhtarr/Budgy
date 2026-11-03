import type { Account, AccountGroup, Amounts } from '@/shared/models';

const decimalsCache = new Map<string, number>();

/** Decimal places a currency uses: 2 for most, 3 for KWD/BHD/OMR/JOD, 0 for JPY. */
export function decimalsOf(cur: string): number {
  let d = decimalsCache.get(cur);
  if (d == null) {
    try {
      d = new Intl.NumberFormat('en', { style: 'currency', currency: cur }).resolvedOptions().maximumFractionDigits ?? 2;
    } catch {
      d = 2;
    }
    decimalsCache.set(cur, d);
  }
  return d;
}

/** Rounds an amount to the smallest unit of its currency (cents, fils…). */
export function roundTo(n: number, cur: string): number {
  const f = 10 ** decimalsOf(cur);
  return Math.round(n * f) / f;
}

export function groupOf(a: Account): AccountGroup {
  return a.group ?? 'regular';
}

/** The currencies an account holds: its main one first, then the optional second one. */
export function currenciesOf(a: Account): string[] {
  return a.currency2 && a.currency2 !== a.currency ? [a.currency, a.currency2] : [a.currency];
}

/** Opening balances of an account, keyed by currency. */
export function openingOf(a: Account): Amounts {
  const m: Amounts = { [a.currency]: a.initialBalance || 0 };
  if (a.currency2 && a.currency2 !== a.currency) m[a.currency2] = a.initialBalance2 || 0;
  return m;
}

/**
 * Per-currency lines to show for an account: its own currencies always,
 * plus any other currency it still has money in (e.g. after its currency was changed).
 */
export function linesOf(a: Account, amounts: Amounts | undefined): [string, number][] {
  const own = currenciesOf(a);
  const lines: [string, number][] = own.map((c) => [c, amounts?.[c] ?? 0]);
  for (const [c, n] of Object.entries(amounts ?? {})) if (!own.includes(c) && n !== 0) lines.push([c, n]);
  return lines;
}

/** Adds several per-currency amounts together. */
export function addAmounts(list: (Amounts | undefined)[]): Amounts {
  const out: Amounts = {};
  for (const m of list) for (const [c, n] of Object.entries(m ?? {})) out[c] = roundTo((out[c] ?? 0) + n, c);
  return out;
}
