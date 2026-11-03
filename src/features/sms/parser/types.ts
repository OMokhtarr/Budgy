export type SmsDirection = 'out' | 'in';
export type IgnoreReason = 'otp' | 'promo' | 'balance';

/** A text as read from the inbox (the native plugin returns this shape). */
export interface SmsMessage {
  id: string;
  address: string;
  /** When it was received, ms since epoch. */
  date: number;
  body: string;
}

/** What Budgy could read from one bank text. */
export type ParsedSms =
  | { status: 'ignored'; reason: IgnoreReason }
  | {
      /** 'understood' only when amount AND direction were read with confidence. */
      status: 'understood' | 'unreadable';
      amount?: number;
      /** ISO code from CURRENCIES, e.g. 'EGP'. */
      currency?: string;
      direction?: SmsDirection;
      merchant?: string;
      /** Masked card or account digits, e.g. '4821'. */
      digits?: string;
    };

/** One bank's message formats, kept as data. Each regex's first capture group is the value. */
export interface BankTemplate {
  id: string;
  /** Tested against the sender name. */
  sender: RegExp;
  /** Tried in order; the first whose `match` hits the body is used. */
  formats: {
    match: RegExp;
    direction: SmsDirection;
    amount: RegExp;
    currency?: RegExp;
    merchant?: RegExp;
    digits?: RegExp;
  }[];
}
