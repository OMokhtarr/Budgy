import type { Transaction } from '@/shared/models';
import { roundTo } from './currency';
import type { LendingShares } from './lending';
import type { BaseConverter } from './txRate';

/**
 * Accounts have tiles among the categories. Money sent to a savings tile counts as spending and money
 * coming back from it takes that away. For a debt tile only lending counts that way; borrowing and
 * paying a loan back don't. An everyday tile shows the money moved in and out of it, which is never
 * spending. A tile's own expenses aren't part of this: they already count through their categories.
 */
export interface TileScope {
  /** Debt and savings accounts, whatever the filter says: money sent to them counts as spending. */
  tileIds: Set<string>;
  /** Debt accounts, with how much of each transfer was lending. A transfer missing from it counts nothing. */
  lending?: LendingShares;
  /** Everyday accounts: money moved in and out of them shows on their tile only. */
  everydayIds: Set<string>;
  /** Accounts whose spending is shown; only money moving to or from these counts. */
  shownIds: Set<string>;
}

export type Money = [amount: number, currency: string];

/** Money moved in (1) or out (-1) of an everyday tile, in the currency it had on that account. */
export interface TileShift {
  tileId: string;
  sign: 1 | -1;
  onTile: Money;
}

/** How a transfer moves money in and out of everyday tiles: one shift per everyday side. Exchanges inside one account move nothing. */
export function everydayShiftsOf(t: Transaction, { everydayIds }: TileScope): TileShift[] {
  if (t.type !== 'transfer' || t.toAccountId == null || t.toAccountId === t.accountId) return [];
  const shifts: TileShift[] = [];
  if (everydayIds.has(t.toAccountId)) shifts.push({ tileId: t.toAccountId, sign: 1, onTile: [t.toAmount ?? t.amount, t.toCurrency ?? t.currency] });
  if (everydayIds.has(t.accountId)) shifts.push({ tileId: t.accountId, sign: -1, onTile: [t.amount, t.currency] });
  return shifts;
}

export interface TileMove {
  tileId: string;
  /** 1 = sent to the tile, -1 = came back from it. */
  sign: 1 | -1;
  /** What moved on the tile's side, for showing on the tile. */
  onTile: Money;
  /** What left or reached the other account, which is what it cost. */
  onOther: Money;
}

/** How a transaction moves money to or from a tile, or null if it doesn't. Moves between two tiles don't count. */
export function tileMoveOf(t: Transaction, scope: TileScope): TileMove | null {
  const move = wholeMoveOf(t, scope);
  if (!move) return null;
  const shares = scope.lending?.get(move.tileId);
  if (!shares) return move;
  const share = (t.id != null && shares.get(t.id)) || 0;
  if (!share) return null;
  const part = ([amount, currency]: Money): Money => [roundTo(amount * share, currency), currency];
  return { ...move, onTile: part(move.onTile), onOther: part(move.onOther) };
}

/** The whole transfer as a move to or from a tile, before only the lending part of a debt is kept. */
function wholeMoveOf(t: Transaction, { tileIds, shownIds }: TileScope): TileMove | null {
  if (t.type !== 'transfer' || t.toAccountId == null) return null;
  const sent: Money = [t.amount, t.currency];
  const arrived: Money = [t.toAmount ?? t.amount, t.toCurrency ?? t.currency];
  if (tileIds.has(t.toAccountId) && !tileIds.has(t.accountId) && shownIds.has(t.accountId)) {
    return { tileId: t.toAccountId, sign: 1, onTile: arrived, onOther: sent };
  }
  if (tileIds.has(t.accountId) && !tileIds.has(t.toAccountId) && shownIds.has(t.toAccountId)) {
    return { tileId: t.accountId, sign: -1, onTile: sent, onOther: arrived };
  }
  return null;
}

/**
 * What a move adds to spending, in the main currency; negative when money came back.
 * An exchange with the main currency on either side has its own rate: what moved in the main currency.
 */
export function moveInBase({ sign, onTile, onOther }: TileMove, { base, toBase }: BaseConverter): number {
  return sign * toBase(...(onTile[1] === base && onOther[1] !== base ? onTile : onOther));
}

/** What a transaction adds to spending through a tile, in the main currency; negative when money came back. */
export function spentOnTile(t: Transaction, scope: TileScope, conv: BaseConverter): number {
  const move = tileMoveOf(t, scope);
  return move ? moveInBase(move, conv) : 0;
}
