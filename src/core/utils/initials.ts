// Stops Arabic letters joining up, which would make initials read as a word.
const NO_JOIN = '‌';

/** The first letters of a name's first and last words, or of its only word. Empty without a name. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const firstLetter = (word: string) => [...word][0].toUpperCase();
  const first = firstLetter(words[0]);
  return words.length === 1 ? first : first + NO_JOIN + firstLetter(words[words.length - 1]);
}
