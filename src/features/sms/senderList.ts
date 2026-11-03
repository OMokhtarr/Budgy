import { normalizeKeyword } from './parser/senders';

/** Adds a sender keyword, tidied; blank ones and ones already listed (ignoring case) are skipped. */
export function addSender(list: string[], keyword: string): string[] {
  const k = normalizeKeyword(keyword);
  if (!k || list.some((x) => x.toLocaleLowerCase('en') === k.toLocaleLowerCase('en'))) return list;
  return [...list, k];
}

export function removeSender(list: string[], keyword: string): string[] {
  return list.filter((x) => x !== keyword);
}
