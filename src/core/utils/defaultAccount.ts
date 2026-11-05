import type { Account, TxType } from '@/shared/models';

/**
 * The account a new transaction starts on: the one set as the default for its type, otherwise the last
 * used one, otherwise the first. An account reserved for the opposite type is only used as a last resort.
 */
export function defaultAccountFor(accounts: Account[], type: TxType, last: string | undefined): string | undefined {
  if (type === 'transfer') return (accounts.find((a) => a.id === last) ?? accounts[0])?.id;
  const reservedForOther = (a: Account) => a.defaultFor != null && a.defaultFor !== type;
  const open = accounts.filter((a) => !reservedForOther(a));
  return (open.find((a) => a.defaultFor === type) ?? open.find((a) => a.id === last) ?? open[0] ?? accounts[0])?.id;
}

/** Splits a list into the built-in Cash In and Cash Out accounts and the rest, each keeping its order. */
export function splitMainAccounts(accounts: Account[]): [main: Account[], rest: Account[]] {
  return [accounts.filter((a) => a.key), accounts.filter((a) => !a.key)];
}
