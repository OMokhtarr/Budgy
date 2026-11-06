import { describe, expect, it } from 'vitest';
import { lendingShares } from './lending';
import type { Account, Transaction } from '@/shared/models';

const AHMED: Account = { id: 'ahmed', name: 'Ahmed', type: 'cash', icon: 'person', color: '#000', currency: 'EGP', initialBalance: 0, group: 'debt', order: 0, createdAt: 'x' };

let n = 0;
/** A transfer on day `day`; created in the order written, so same-day moves keep that order. */
const move = (day: number, amount: number, accountId: string, toAccountId: string, fields: Partial<Transaction> = {}): Transaction => ({
  id: `t${++n}`, type: 'transfer', amount, currency: 'EGP', accountId, toAccountId,
  date: `2026-03-${String(day).padStart(2, '0')}T10:00:00.000Z`, createdAt: `2026-01-01T00:00:${String(n).padStart(2, '0')}.000Z`, ...fields,
});
const lend = (day: number, amount: number, fields?: Partial<Transaction>) => move(day, amount, 'cash', 'ahmed', fields);
const back = (day: number, amount: number, fields?: Partial<Transaction>) => move(day, amount, 'ahmed', 'cash', fields);
const shares = (txs: Transaction[], debt: Account = AHMED) => {
  const m = lendingShares([debt], txs).get(debt.id!);
  return txs.map((t) => m?.get(t.id!));
};

describe('lendingShares', () => {
  it('counts all of a loan you give and all of it coming back', () => {
    expect(shares([lend(1, 500), back(2, 200), back(3, 300)])).toEqual([1, 1, 1]);
  });

  it('counts none of a loan you take or pay back', () => {
    expect(shares([back(1, 10000), lend(2, 1000), lend(3, 9000)])).toEqual([0, 0, 0]);
  });

  it('splits money coming back that is more than they owed you', () => {
    // They owe you 300 and send 800: 300 is paying you back, 500 is you borrowing.
    expect(shares([lend(1, 300), back(2, 800)])).toEqual([1, 300 / 800]);
  });

  it('splits money sent that pays off what you owe and then lends the rest', () => {
    // You owe them 500 and send 800: 500 pays them back, 300 is a new loan to them.
    expect(shares([back(1, 500), lend(2, 800)])).toEqual([0, 300 / 800]);
  });

  it('starts from the balance typed when the debt was set up', () => {
    expect(shares([back(1, 100)], { ...AHMED, initialBalance: 1000 })).toEqual([1]);
    expect(shares([lend(1, 100)], { ...AHMED, initialBalance: -1000 })).toEqual([0]);
  });

  it('follows the order things happened, not the order they were entered', () => {
    // Entered first but happened later: Ahmed paying back what was lent on the 2nd.
    const later = back(5, 500);
    const earlier = lend(2, 500);
    expect(shares([later, earlier])).toEqual([1, 1]);
  });

  it('keeps each currency of a debt apart', () => {
    const usdDebt = { ...AHMED, currency2: 'USD', initialBalance: -1000 };
    // You owe 1000 EGP, but lending 50 USD is still a loan you give.
    expect(shares([lend(1, 2500, { toAmount: 50, toCurrency: 'USD' })], usdDebt)).toEqual([1]);
  });

  it('measures money in the currency it has on the debt', () => {
    // They owe 100 USD and send back 7500 EGP worth 150 USD from the debt's side: 100 of the 150 is paying you back.
    const usdDebt = { ...AHMED, currency: 'USD', initialBalance: 100 };
    expect(shares([back(1, 150, { currency: 'USD', toAmount: 7500, toCurrency: 'EGP' })], usdDebt)).toEqual([100 / 150]);
  });

  it('lets expenses and income on the debt move its balance', () => {
    // Lend 300, then pay a 400 bill from the debt: you now owe 100, so sending 100 more back to you is borrowing.
    const lent = lend(1, 300);
    const spentFromDebt: Transaction = { ...back(1, 400), type: 'expense', toAccountId: undefined };
    expect(shares([lent, spentFromDebt, back(2, 100)])).toEqual([1, undefined, 0]);
  });

  it('leaves out transfers that do not touch a debt', () => {
    expect(shares([move(1, 100, 'cash', 'bank')])).toEqual([undefined]);
  });
});
