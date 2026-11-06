import { parseNumber } from './number';

/** Who owes whom on a debt: 'owed' = they owe you (balance above zero), 'owe' = you owe them (below zero). */
export type DebtSide = 'owed' | 'owe';

/**
 * Which way a debt's typed balances point: undefined when nothing is owed yet, 'mixed' when its two
 * currencies point opposite ways (so the balances have to be typed with their signs).
 */
export function debtSideOf(balances: string[]): DebtSide | 'mixed' | undefined {
  const values = balances.map((b) => parseNumber(b) || 0);
  const owe = values.some((n) => n < 0);
  const owed = values.some((n) => n > 0);
  if (owe && owed) return 'mixed';
  return owe ? 'owe' : owed ? 'owed' : undefined;
}

/** The amount without its minus sign, for typing a debt as a plain number. */
export const unsigned = (balance: string) => balance.replace(/^-/, '');

/** The balance to store for an amount typed on a debt: negative when you owe them. */
export function signedFor(typed: string, side: DebtSide): string {
  const amount = unsigned(typed);
  return side === 'owe' && parseNumber(amount) ? `-${amount}` : amount;
}
