/** A sender keyword as the user typed it, tidied: trimmed, inner spaces collapsed, case kept for display. */
export function normalizeKeyword(k: string): string {
  return k.trim().replace(/\s+/g, ' ');
}

/** True when `text` contains any keyword, ignoring case. Blank keywords never match. */
export function containsKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLocaleLowerCase('en');
  return keywords.some((k) => {
    const key = normalizeKeyword(k).toLocaleLowerCase('en');
    return key !== '' && lower.includes(key);
  });
}

/** True when the sender name contains any sender keyword, ignoring case. */
export const matchesSender = containsKeyword;
