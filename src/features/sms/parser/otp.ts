import { findAmounts } from './text';

/** An Arabic word on its own, not inside a longer one ("هو" but not "وهوى"). */
const ar = (w: string) => `(?<![\\u0621-\\u064A])${w}(?![\\u0621-\\u064A])`;

/**
 * Words that only ever name a one-time code. "رمز" or "code" alone don't: "رمز العملية" and
 * "auth code" are references on real debits.
 */
const OTP_WORD =
  '\\b(?:otp|one[- ]time (?:password|passcode|pin|code)|passcode|(?:verification|security|authentication|activation|secure|access|login) (?:code|pin))\\b' +
  '|(?:رمز|كود) (?:التحقق|التفعيل|الأمان|الامان)|لمرة واحدة|(?:كلمة (?:المرور|السر)|(?:الرقم|الرمز) السري) المؤقت(?:ة)?';
/** Also the reference on a completed payment's receipt, so only an OTP word while the money hasn't moved yet. */
const CONFIRM_WORD = '\\bconfirmation (?:code|pin)\\b|(?:رمز|كود) (?:التأكيد|التاكيد)';
/** Wording that says the money already moved. */
const DONE = /\b(?:debited|credited|deducted|withdrawn|deposited|charged|refunded|successful(?:ly)?)\b|تم|بنجاح/i;

/** A 4–8 digit code on its own: not masked digits, a date or time part, a decimal, or a percentage. */
const CODE = '(?<![\\d*xX•#/.,])(?<!\\d[:-])\\d{4,8}(?![\\d%٪]|[.,/:-]\\d)';
const IS = `(?:\\bis\\b|${ar('هو')}|${ar('هي')})`;
/**
 * Text up to the end of the sentence ("." before a space ends it; "450.00" and "AMAZON.EG" don't),
 * never past a word that makes the next number a balance, hotline or reference.
 */
const SAME_SENTENCE = (max: number) =>
  '(?:(?!\\b(?:balance|bal|avl|available|limit|call|contact|hotline|ref|reference)\\b|رصيد|المتاح|للاستفسار|اتصل|مرجع)' +
  `(?:[^.!?؟\\n]|\\.(?=\\S))){0,${max}}?`;
const MINUTES = '\\d+\\s*(?:min|mins|minutes?|secs?|seconds?|دقيقة|دقائق|ثانية|ثوان)';

/** Forms that tie a code to an OTP word, each one enough on its own. */
function boundForms(word: string): RegExp[] {
  return [
    // "OTP: 482913", "كود التحقق الخاص بك هو 4821"
    `(?:${word})(?:[\\s:=-]|\\bis\\b|\\bcode\\b|${ar('هو')}|${ar('هي')}|الخاص(?:ة)? بك(?:م)?)*${CODE}`,
    // "Your OTP for purchase of EGP 450.00 at AMAZON is 482913"
    `(?:${word})${SAME_SENTENCE(120)}(?:${IS}|[:=])\\s*${CODE}`,
    // "482913 is your OTP", "482913 is your InstaPay code", "482913 هو رمز التحقق"
    `${CODE}\\s+${IS}\\s+(?:${SAME_SENTENCE(25)}(?:${word})|(?:your|the)\\s+(?:[\\w-]+\\s+){0,2}?code\\b|${ar('(?:الرمز|الكود)')})`,
  ].map((s) => new RegExp(s, 'i'));
}
const BOUND = boundForms(OTP_WORD);
const BOUND_NOT_DONE = boundForms(`${OTP_WORD}|${CONFIRM_WORD}`);

/** Forms that ask for or expire a code, which no completed transaction does. */
const INTENT = [
  // "Use 482913 to confirm", "استخدم 482913 لتأكيد"
  `(?:\\b(?:use|enter)\\b|${ar('استخدم')}|${ar('ادخل')}|${ar('أدخل')})[^\\d.!?؟\\n]{0,20}${CODE}`,
  // "valid for 5 minutes", "صالح لمدة 5 دقائق"
  `\\bvalid (?:only )?for ${MINUTES}|\\bexpires? (?:in|after) ${MINUTES}|صالح(?:ة)? لمدة ${MINUTES}`,
  '\\b(?:do not|don\'t|never) share this (?:code|otp|password|pin)\\b|لا (?:تشارك|تعطي) (?:هذا الرمز|هذا الكود)',
].map((s) => new RegExp(s, 'i'));

/** "never share your OTP" and "لا تشارك رمز التحقق": a warning on real debits, not a code being sent. */
const SHARE_WARNING = new RegExp(
  `(?:\\b(?:share|disclose|give|tell|reveal)\\b|تشارك|تعطي|تفصح|تخبر|تفشي)[^.!?؟\\n]{0,40}?(?:${OTP_WORD}|${CONFIRM_WORD})`,
  'gi',
);

/** Any OTP wording, e.g. a "never share your OTP" footer: only trusted when no transaction was read. */
export const OTP_MENTION = new RegExp(`${OTP_WORD}|${CONFIRM_WORD}|كلمة المرور|كلمة السر|لا تشارك|\\bone[- ]time\\b`, 'i');

/** Words that name some code or PIN, OTP or not. Only trusted on texts with no money in them. */
const CODE_WORD = /\b(?:code|pin|password|verify|verification)\b|رمز|كود|تحقق|التحقق/i;
const LONE_CODE = new RegExp(CODE);

/** Whether a Latin-digit text with no money amount names a code and carries one, e.g. "Your InstaPay code: 482913". */
export function sendsBareCode(text: string): boolean {
  return CODE_WORD.test(text) && LONE_CODE.test(text);
}

/** Replaces each span with filler of the same length, so later indexes still line up. */
const blank = (s: string) => '¤'.repeat(s.length);

/** Blanks out money amounts, so "EGP 4500" is never taken for a code. */
function withoutAmounts(text: string): string {
  let out = text;
  for (const a of findAmounts(text)) out = out.slice(0, a.index) + blank(text.slice(a.index, a.end)) + out.slice(a.end);
  return out;
}

/**
 * Whether a Latin-digit text sends a one-time code, even one that quotes the payment it's for. A
 * real debit or credit with an "OTP" footer, hotline, year, reference or approval code is not one.
 */
export function isOtp(text: string): boolean {
  const plain = withoutAmounts(text);
  if (INTENT.some((re) => re.test(plain))) return true;
  const unwarned = plain.replace(SHARE_WARNING, blank);
  return (DONE.test(text) ? BOUND : BOUND_NOT_DONE).some((re) => re.test(unwarned));
}
