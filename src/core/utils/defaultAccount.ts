import type { Account, AccountType, Transaction, TxType } from '@/shared/models';

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

/**
 * The account a transaction added from a category starts on, given the accounts picked in the filter:
 * that account if just one is picked; if several, the one a transaction was last written from, otherwise
 * their default. Undefined when nothing is picked, so the editor's usual default applies.
 */
export function filterAccountFor(
  picked: Account[],
  type: TxType,
  txs: Pick<Transaction, 'accountId' | 'createdAt'>[],
): string | undefined {
  if (picked.length <= 1) return picked[0]?.id;
  const ids = new Set(picked.map((a) => a.id));
  const latest = txs
    .filter((t) => ids.has(t.accountId))
    .reduce<(typeof txs)[number] | undefined>((best, t) => (!best || t.createdAt > best.createdAt ? t : best), undefined);
  return latest?.accountId ?? defaultAccountFor(picked, type, undefined);
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
