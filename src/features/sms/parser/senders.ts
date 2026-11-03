/** A sender keyword as the user typed it, tidied: trimmed, inner spaces collapsed, case kept for display. */
export function normalizeKeyword(k: string): string {
  return k.trim().replace(/\s+/g, ' ');
}

/** True when the sender name contains any keyword, ignoring case. Blank keywords never match. */
export function matchesSender(sender: string, keywords: string[]): boolean {
  const name = sender.toLocaleLowerCase('en');
  return keywords.some((k) => {
    const key = normalizeKeyword(k).toLocaleLowerCase('en');
    return key !== '' && name.includes(key);
  });
}
