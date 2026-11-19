/** A sender keyword as the user typed it, tidied: trimmed, inner spaces collapsed, case kept for display. */
export function normalizeKeyword(k: string): string {
  return k.trim().replace(/\s+/g, ' ');
}

/** Arabic vowel marks and tatweel (the stretching dash), which don't change the word. */
const AR_MARKS = /[ً-ْٰـ]/g;
/** Alef with hamza or madda, often typed as a plain alef. */
const AR_ALEF = /[آأإٱ]/g;

/** Text as compared: spaces and line breaks collapsed, lower case, Arabic marks dropped and alef forms made one. */
function folded(s: string): string {
  return normalizeKeyword(s).toLocaleLowerCase('en').replace(AR_MARKS, '').replace(AR_ALEF, 'ا');
}

/**
 * True when `text` contains any keyword, ignoring case, spacing and line breaks, Arabic vowel marks and
 * alef forms. Blank keywords never match.
 */
export function containsKeyword(text: string, keywords: string[]): boolean {
  const body = folded(text);
  return keywords.some((k) => {
    const key = folded(k);
    return key !== '' && body.includes(key);
  });
}

/** True when the sender name contains any sender keyword, ignoring case. */
export const matchesSender = containsKeyword;
