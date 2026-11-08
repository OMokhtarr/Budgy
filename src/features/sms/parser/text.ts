import { CURRENCIES } from '@/core/contexts/SettingsContext';
import { parseNumber } from '@/core/utils/number';
import type { SmsDirection } from './types';

/** Arabic-Indic and Persian digits → 0-9, Arabic decimal and thousands marks → '.' and ','. Keeps the length. */
export function toLatinDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
    .replace(/٫/g, '.')
    .replace(/٬/g, ',');
}

/** How banks write each currency, besides its ISO code. */
const ALIASES: Record<string, string[]> = {
  EGP: ['LE', 'L.E', 'L.E.', 'ج.م', 'ج.م.', 'جم', 'جنيه', 'جنيها', 'جنيهاً'],
  USD: ['$', 'دولار'],
  EUR: ['€', 'يورو'],
  SAR: ['ريال'],
  AED: ['درهم'],
};

const TOKENS = new Map<string, string>();
for (const c of CURRENCIES) TOKENS.set(c.toLowerCase(), c);
for (const [c, list] of Object.entries(ALIASES)) for (const a of list) TOKENS.set(a.toLowerCase(), c);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Longest first, so "L.E." wins over "LE" and "ج.م." over "ج.م".
const TOKEN_RE = [...TOKENS.keys()].sort((a, b) => b.length - a.length).map(escape).join('|');
// Letters only: Arabic punctuation such as "،" (U+060C) must still end a currency word.
const LETTER = 'A-Za-z\\u0621-\\u064A';
const CUR_BEFORE = new RegExp(`(?<![${LETTER}])(${TOKEN_RE})\\s*$`, 'i');
// A currency followed by another number belongs to that number ("card 4821 EGP 450").
const CUR_AFTER = new RegExp(`^\\s*(${TOKEN_RE})(?![${LETTER}])(?!\\s*\\d)`, 'i');
const NUMBER = /\d+(?:[.,]\d+)*/g;
/** Characters that make the number after them a masked card, a time or a date part, not money. */
const NOT_MONEY_BEFORE = /[*xX•#:/-]/;

/** "5,000.00" and "1.500,00": with both marks, the last one is the decimal point; otherwise as `parseNumber`. */
function parseAmount(s: string): number {
  const dot = s.lastIndexOf('.');
  const comma = s.lastIndexOf(',');
  if (dot < 0 || comma < 0) return parseNumber(s);
  const [dec, thousands] = dot > comma ? ['.', ','] : [',', '.'];
  return parseFloat(s.split(thousands).join('').replace(dec, '.'));
}

/** ISO code for a currency as written in a text ("L.E", "ج.م", "usd"), or undefined. */
export function currencyOf(token: string): string | undefined {
  return TOKENS.get(token.trim().toLowerCase());
}

export interface FoundAmount {
  amount: number;
  currency?: string;
  /** Where the number starts and ends in the text. */
  index: number;
  end: number;
}

/**
 * Every money amount in the text, in order. A number counts only when a currency is written right
 * before or after it, which keeps masked digits, dates and codes out.
 */
export function findAmounts(body: string): FoundAmount[] {
  const text = toLatinDigits(body);
  const found: FoundAmount[] = [];
  for (const m of text.matchAll(NUMBER)) {
    const index = m.index!;
    const end = index + m[0].length;
    if (index > 0 && NOT_MONEY_BEFORE.test(text[index - 1])) continue;
    const token = currencyTokenAround(text, index, end);
    if (!token) continue;
    const amount = parseAmount(m[0]);
    if (amount > 0) found.push({ amount, currency: currencyOf(token), index, end });
  }
  return found;
}

/** The currency word written right before or after the number at [index, end) of a Latin-digit text. */
function currencyTokenAround(text: string, index: number, end: number): string | undefined {
  const before = CUR_BEFORE.exec(text.slice(Math.max(0, index - 12), index));
  const after = CUR_AFTER.exec(text.slice(end));
  return before?.[1] ?? after?.[1];
}

/** ISO code of the currency written next to the number at [index, end) of the text, or undefined. */
export function currencyNear(body: string, index: number, end: number): string | undefined {
  const token = currencyTokenAround(toLatinDigits(body), index, end);
  return token ? currencyOf(token) : undefined;
}

const DIGIT_PATTERNS = [
  /[*xX•#]{2,}\s?(\d{3,4})(?!\d)/,
  /ending(?:\s+(?:with|in))?\s*(\d{3,4})(?!\d)/i,
  /المنته(?:ي|ية)\s*(?:ب|بـ|في)\s*(\d{3,4})(?!\d)/,
];
/** The masked number right after "from"/"من" (money left it) and after "to"/"إلى" (money arrived). */
const DIGITS_AFTER: Record<SmsDirection, RegExp> = {
  out: /(?:\bfrom|من)\s+(?:\w+\s+)?[*xX•#]{2,}\s?(\d{3,4})(?!\d)/i,
  in: /(?:\bto|إلى|الى)\s+(?:\w+\s+)?[*xX•#]{2,}\s?(\d{3,4})(?!\d)/i,
};

/**
 * Masked card or account digits ("**4821", "xx1234", "ending with 7781"), or undefined. In a transfer
 * ("from **9999 to **1234") the direction picks the side: the sender for 'out', the receiver for 'in'.
 */
export function findDigits(body: string, direction?: SmsDirection): string | undefined {
  const text = toLatinDigits(body);
  const side = direction && DIGITS_AFTER[direction].exec(text);
  if (side) return side[1];
  for (const re of DIGIT_PATTERNS) {
    const m = re.exec(text);
    if (m) return m[1];
  }
  return undefined;
}
