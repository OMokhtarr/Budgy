import { normalizeKeyword } from './parser/senders';

/** Adds a keyword (a bank sender or an ignore word), tidied; blank ones and ones already listed (ignoring case) are skipped. */
export function addKeyword(list: string[], keyword: string): string[] {
  const k = normalizeKeyword(keyword);
  if (!k || list.some((x) => x.toLocaleLowerCase('en') === k.toLocaleLowerCase('en'))) return list;
  return [...list, k];
}

export function removeKeyword(list: string[], keyword: string): string[] {
  return list.filter((x) => x !== keyword);
}
