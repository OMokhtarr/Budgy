import { parseNumber } from '@/core/utils/number';
import { BANK_TEMPLATES } from './templates';
import { currencyOf, findAmounts, findDigits, toLatinDigits, type FoundAmount } from './text';
import type { BankTemplate, IgnoreReason, ParsedSms, SmsDirection } from './types';

/** An Arabic word on its own, not inside a longer one ("عرض" but not "معرض"). */
const ar = (w: string) => `(?<![\\u0621-\\u064A])${w}(?![\\u0621-\\u064A])`;

/** An OTP with its code: always dropped, even when it quotes the purchase it's for. */
const OTP_CODE = /(\b(otp|one[- ]time password|verification code|passcode)\b|(رمز|كود) التحقق).{0,60}?(?<![*xX\d.,])\d{4,8}(?![\d.,]\d)/i;
/** OTP wording without a code, e.g. a "never share your OTP" footer: dropped only when no transaction was read. */
const OTP = /\b(otp|one[- ]time|verification code|passcode)\b|رمز التحقق|كود التحقق|كلمة المرور|لا تشارك/i;
// "تم خصم" is a debit; "خصم 20%" is an offer, caught by the percent sign.
const PROMO = new RegExp(`https?://|www\\.|\\d\\s*[%٪]|\\b(offers?|cashback|win)\\b|${ar('عرض')}|${ar('اربح')}`, 'i');
const BALANCE = /\bbalance\b|رصيد/i;
/** Top-ups ("تم شحن رصيد") talk about رصيد without being balance notices. */
const TOP_UP = /\b(recharge|top[- ]?up)\b|شحن/i;
const OUT =
  /\b(debited|deducted|charged|purchased?|spent|sent|withdrawn|withdrawal|payment|paid|used for|was used)\b|\bfrom your (account|card)\b|خصم|سحب|شراء|مشتريات|دفع|سداد|تحويل صادر|استخدام بطاقت|من حسابك/i;
const IN =
  /\b(credited|deposited|deposit|received|refunded|refund|reversed|reversal)\b|\b(to|into) your account\b|إضافة|اضافة|إيداع|ايداع|استلام|استرداد|تحويل وارد|حوالة واردة|(إلى|الى|الي) حسابك/i;
/** Declined, upcoming or pending: money that didn't move, so the direction isn't trusted. */
const NOT_DONE = /\b(declined|rejected|failed|unsuccessful|insufficient|will be|due|reminder|pending|statement)\b|سيتم|رفض|لم تتم|لم يتم|مستحق|تذكير|كشف حساب/i;
/** Words that make the next amount a balance or limit, not the transaction. */
const BALANCE_WORD = /\b(balance|bal|avl|available|limit)\b|رصيد|المتاح/i;
const MERCHANT = /(?:\bat|لدى|عند)\s+(.+?)(?=\s+on\s|\s+\d{1,2}[/-]\d{1,2}|[.,،]|$)/i;
const MERCHANT_IN = /\bfrom\s+(.+?)(?=\s+on\s|\s+\d{1,2}[/-]\d{1,2}|[.,،]|$)/i;

/** Drops undefined fields so results compare and store cleanly. */
function result(r: ParsedSms): ParsedSms {
  return Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined)) as ParsedSms;
}

/** Why a text isn't worth reviewing; texts with a readable transaction are only dropped for an OTP code. */
function ignoreReason(text: string, isTransaction: boolean, notDone: boolean): IgnoreReason | undefined {
  if (OTP_CODE.test(text)) return 'otp';
  if (isTransaction) return undefined;
  if (OTP.test(text)) return 'otp';
  if (PROMO.test(text)) return 'promo';
  if (BALANCE.test(text) && !notDone && !TOP_UP.test(text)) return 'balance';
  return undefined;
}

function directionOf(text: string): SmsDirection | undefined {
  if (NOT_DONE.test(text)) return undefined;
  const out = OUT.test(text);
  const inn = IN.test(text);
  return out === inn ? undefined : out ? 'out' : 'in';
}

/** The first amount with no balance word between it and the amount before it (or the start). */
function transactionAmount(text: string): FoundAmount | undefined {
  let from = 0;
  for (const a of findAmounts(text)) {
    if (!BALANCE_WORD.test(text.slice(from, a.index))) return a;
    from = a.end;
  }
  return undefined;
}

function fromTemplate(sender: string, body: string, templates: BankTemplate[]): ParsedSms | undefined {
  const text = toLatinDigits(body);
  for (const tpl of templates) {
    if (!tpl.sender.test(sender)) continue;
    const f = tpl.formats.find((x) => x.match.test(text));
    if (!f) continue;
    const amount = parseNumber(f.amount.exec(text)?.[1] ?? '');
    if (!(amount > 0)) return undefined;
    const cur = f.currency?.exec(text)?.[1];
    return result({
      status: 'understood',
      amount,
      currency: cur ? currencyOf(cur) : undefined,
      direction: f.direction,
      merchant: f.merchant?.exec(text)?.[1]?.trim(),
      digits: f.digits?.exec(text)?.[1],
    });
  }
  return undefined;
}

/**
 * Reads one bank text: a matching bank template first; then OTPs, promotions and balance notices are
 * ignored; then the generic Arabic/English reader. 'understood' needs both an amount and a direction;
 * anything less is 'unreadable', with whatever was found.
 */
export function parseSms(sender: string, body: string, templates: BankTemplate[] = BANK_TEMPLATES): ParsedSms {
  const known = fromTemplate(sender, body, templates);
  if (known) return known;

  const text = toLatinDigits(body);
  const direction = directionOf(text);
  const money = transactionAmount(text);
  const reason = ignoreReason(text, !!(direction && money), NOT_DONE.test(text));
  if (reason) return { status: 'ignored', reason };

  const merchant = (direction === 'in' ? MERCHANT_IN : MERCHANT).exec(body)?.[1]?.trim().slice(0, 40);
  return result({
    status: money && direction ? 'understood' : 'unreadable',
    amount: money?.amount,
    currency: money?.currency,
    direction,
    merchant: merchant || undefined,
    digits: findDigits(text),
  });
}
