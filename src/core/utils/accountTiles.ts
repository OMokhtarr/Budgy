import type { Transaction } from '@/shared/models';
import type { BaseConverter } from './txRate';

/**
 * Debt and savings accounts can show as tiles among the categories. Money sent to a tile counts as
 * spending and money coming back from it takes that away. A tile's own expenses aren't part of this:
 * they already count through their categories.
 */
export interface TileScope {
  /** Accounts with a tile. */
  tileIds: Set<string>;
  /** Accounts whose spending is shown; only money moving to or from these counts. */
  shownIds: Set<string>;
}

type Money = [amount: number, currency: string];

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
export function tileMoveOf(t: Transaction, { tileIds, shownIds }: TileScope): TileMove | null {
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
