import { db, type BudgyDB } from '@/core/db/db';
import { buildTxRecord, type TxDraft } from '@/features/transactions/txRecord';
import type { SmsPending } from '@/shared/models';
import { findManualDuplicate } from './duplicate';
import { importText } from './learning';

/** Which of the selection bar's actions fit the selected texts. */
export interface BatchActions {
  sameCategory: boolean;
  combine: boolean;
  takeOff: boolean;
}

const understood = (item: SmsPending) => item.status === 'understood' && !!item.amount && item.amount > 0;

/**
 * Every action needs texts that were read. One category fits texts that all go the same way; combining needs
 * two or more; taking money off a purchase needs every text to be money in.
 */
export function actionsFor(items: SmsPending[]): BatchActions {
  if (!items.length || !items.every(understood)) return { sameCategory: false, combine: false, takeOff: false };
  const allIn = items.every((x) => x.direction === 'in');
  const allOut = items.every((x) => x.direction !== 'in');
  return { sameCategory: allIn || allOut, combine: items.length > 1, takeOff: allIn };
}

/** The fingerprints of the drafts that look like a transaction already added by hand. */
export async function duplicatesOf(drafts: { fingerprint: string; draft: TxDraft }[], database: BudgyDB = db): Promise<Set<string>> {
  const found = new Set<string>();
  for (const { fingerprint, draft } of drafts) {
    if (await findManualDuplicate(draft, database)) found.add(fingerprint);
  }
  return found;
}

/** Saves each text's transaction on its own (as its card's Confirm would); one that fails doesn't stop the rest. */
export async function importMany(entries: { item: SmsPending; draft: TxDraft }[], database: BudgyDB = db): Promise<{ saved: number; failed: number }> {
  let saved = 0;
  let failed = 0;
  for (const { item, draft } of entries) {
    try {
      await importText(item, buildTxRecord(draft), database);
      saved++;
    } catch {
      failed++;
    }
  }
  return { saved, failed };
}
