import type { Account, AccountType, TxType } from '@/shared/models';

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

/** Account types in the order the app lists them (as in the account editor). */
export const ACCOUNT_TYPES: AccountType[] = ['cash', 'card', 'bank', 'savings', 'wallet'];

/**
 * How a list of accounts is shown: Cash In and Cash Out first, then the rest in one section per type,
 * types in `ACCOUNT_TYPES` order and accounts in their own order. Types with no accounts are left out.
 */
export function accountSections(accounts: Account[]): { main: Account[]; byType: [AccountType, Account[]][] } {
  const [main, rest] = splitMainAccounts(accounts);
  const types = [...new Set([...ACCOUNT_TYPES, ...rest.map((a) => a.type)])];
  const byType = types
    .map((type): [AccountType, Account[]] => [type, rest.filter((a) => a.type === type)])
    .filter(([, list]) => list.length);
  return { main, byType };
}
