export type TxType = 'expense' | 'income' | 'transfer';
/** Money going out or coming in (a transfer is neither). */
export type Flow = 'expense' | 'income';
/** Which transactions a category accepts: expenses, income, or both. */
export type CategoryKind = Flow | 'both';
export type AccountType = 'cash' | 'card' | 'bank' | 'savings' | 'wallet';
/**
 * Where an account belongs: everyday money, savings set aside, or a debt
 * (a person or loan: a positive balance means they owe you, negative means you owe them).
 */
export type AccountGroup = 'regular' | 'savings' | 'debt';

/** Fields every stored record carries, for syncing between devices. */
export interface Synced {
  /** Random UUID, set when the record is first saved. */
  id?: string;
  /** ISO time of the last change on any device ("last edit wins" when syncing). */
  updatedAt?: string;
  /** ISO time it was deleted. Deleted records are kept so the deletion can reach other devices. */
  deletedAt?: string;
  /** Local only: changed on this device and not uploaded yet (1, so it can be indexed). */
  dirty?: 1;
}

export interface Account extends Synced {
  name: string;
  type: AccountType;
  icon: string;
  color: string;
  /** Currency of the account's main balance (ISO code). */
  currency: string;
  /** Optional second currency the account also holds money in, with its own balance. */
  currency2?: string;
  /** Opening balance in `currency`. */
  initialBalance: number;
  /** Opening balance in `currency2`. */
  initialBalance2?: number;
  /** Undefined = 'regular'. Only regular accounts are selected in the accounts filter by default. */
  group?: AccountGroup;
  archived?: boolean;
  order: number;
  createdAt: string;
}

export interface Category extends Synced {
  /** Translation key for built-in categories. If set and `name` is empty, the translated label is shown. */
  key?: string;
  name: string;
  kind: CategoryKind;
  icon: string;
  color: string;
  /** Monthly budget limit (expense categories only). */
  budget?: number;
  archived?: boolean;
  order: number;
}

export interface Transaction extends Synced {
  type: TxType;
  amount: number;
  /** Currency of `amount`; one of the account's currencies. */
  currency: string;
  /** Source account for expense/transfer, destination account for income. */
  accountId: string;
  /** Destination account for transfers. */
  toAccountId?: string;
  /** Transfers between currencies: what arrived in the destination, in `toCurrency`. */
  toAmount?: number;
  toCurrency?: string;
  /** Expense or income category. Undefined for transfers. */
  categoryId?: string;
  /** ISO date-time string of when the transaction happened. */
  date: string;
  note?: string;
  createdAt: string;
}

/** Amounts keyed by currency code, e.g. { EGP: 5000, USD: 200 }. */
export type Amounts = Record<string, number>;

export type PeriodMode = 'day' | 'week' | 'month' | 'year' | 'all';

export interface DateRange {
  start: Date;
  end: Date; // exclusive
}
