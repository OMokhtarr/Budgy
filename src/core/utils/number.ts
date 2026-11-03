/**
 * Number fields (balances, budgets, rates) accept whatever the phone's keyboard types:
 * Arabic-Indic (٠-٩) and Persian (۰-۹) digits, "٫" or "," as the decimal point, and
 * "٬" or "," between thousands.
 */

/** Drops anything that can't be part of a number, keeping the text as typed. */
export function cleanNumberInput(text: string, allowNegative = false): string {
  const kept = text.replace(/[^0-9٠-٩۰-۹.,٫٬]/g, '');
  return allowNegative && /^\s*[-−]/.test(text) ? `-${kept}` : kept;
}

/** Reads a typed number; NaN when there is none. */
export function parseNumber(text: string): number {
  let s = text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
    .replace(/٬|\s/g, '')
    .replace(/٫/g, '.')
    .replace(/−/g, '-');
  // "1,250.5" and "12,000" use commas between thousands; otherwise a comma is the decimal point ("48,5").
  if (s.includes('.') || /^-?[1-9]\d{0,2}(,\d{3})+$/.test(s)) s = s.replace(/,/g, '');
  else s = s.replace(',', '.').replace(/,/g, '');
  return parseFloat(s);
}
