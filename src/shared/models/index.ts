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
  /** Built-in starting account. If set and `name` is empty, the translated label is shown. */
  key?: 'cashIn' | 'cashOut';
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
  /** Undefined = 'regular'. */
  group?: AccountGroup;
  /** New transactions of this type start on this account. At most one account per type. */
  defaultFor?: Flow;
  /** Whether the balance counts in the total at the top. Undefined = on for regular accounts only. */
  includeInTotal?: boolean;
  /** Whether its expenses and income count in the app's lists and totals. Undefined = on for regular accounts only. */
  showInExpenses?: boolean;
  archived?: boolean;
  order: number;
  createdAt: string;
  /** Set only on a 'card' account that is a credit card; a card without it is a debit card. */
  credit?: CreditCard;
}

/** A credit card's limit, statement cycle and minimum payment. */
export interface CreditCard {
  /** Credit limit in the card's main currency. Undefined = not set. */
  limit?: number;
  /** Day of the month the statement is made (1–31; a shorter month uses its last day). */
  statementDay: number;
  /** Day of the month the payment is due: the first such day after the statement. */
  dueDay: number;
  /** Minimum payment as a percent of the statement balance. */
  minPercent?: number;
  /** The minimum payment is at least this much, in the main currency. */
  minAmount?: number;
}

/** A part of a category that people add themselves. Stored inside its category, so it syncs with it. */
export interface Subcategory {
  id: string;
  name: string;
  icon: string;
  /** Hidden from the transaction screen because transactions still use it. */
  archived?: boolean;
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
  subcategories?: Subcategory[];
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
  /**
   * Expenses and income in a foreign currency: what one unit of `currency` was worth in `rateCurrency`
   * when it happened, so totals don't move with the saved rates. Undefined = use today's saved rate.
   */
  rate?: number;
  rateCurrency?: string;
  /** Expense or income category. Undefined for transfers. */
  categoryId?: string;
  /** Optional: one of the category's subcategories. */
  subcategoryId?: string;
  /** ISO date-time string of when the transaction happened. */
  date: string;
  note?: string;
  createdAt: string;
}

/** Amounts keyed by currency code, e.g. { EGP: 5000, USD: 200 }. */
export type Amounts = Record<string, number>;

export type PeriodMode = 'day' | 'week' | 'month' | 'year' | 'all' | 'range';
/** The modes worked out from a date; 'range' is two dates the user picked. */
export type CalendarPeriodMode = Exclude<PeriodMode, 'range'>;

export interface DateRange {
  start: Date;
  end: Date; // exclusive
}
