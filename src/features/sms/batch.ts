import { db, type BudgyDB } from '@/core/db/db';
import { buildTxRecord, type TxDraft } from '@/features/transactions/txRecord';
import type { SmsPending } from '@/shared/models';
import { findDuplicate, type Duplicate } from './duplicate';
import { createPlan, type PlanOptions } from '@/features/accounts/card/instalments';
import { importText, resolveImported } from './learning';

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

/** The drafts that look already saved (added by hand, or a planned instalment), by fingerprint, with what they match. */
export async function duplicatesOf(drafts: { fingerprint: string; draft: TxDraft }[], database: BudgyDB = db): Promise<Map<string, Duplicate>> {
  const found = new Map<string, Duplicate>();
  // One instalment is one month's charge: once a text claims it, the next text can't.
  const taken = new Set<string>();
  for (const { fingerprint, draft } of drafts) {
    const match = await findDuplicate(draft, database, taken);
    if (!match) continue;
    found.set(fingerprint, match);
    if (match.kind === 'instalment') taken.add(match.tx.id!);
  }
  return found;
}

/**
 * Saves each text's transaction on its own (as its card's Confirm would), as instalments when it has a plan; one that
 * fails doesn't stop the rest.
 */
export async function importMany(
  entries: { item: SmsPending; draft: TxDraft; plan?: PlanOptions }[],
  database: BudgyDB = db,
): Promise<{ saved: number; failed: number }> {
  let saved = 0;
  let failed = 0;
  for (const { item, draft, plan } of entries) {
    try {
      if (plan) await resolveImported(item, await createPlan(buildTxRecord(draft), plan, database), database);
      else await importText(item, buildTxRecord(draft), database);
      saved++;
    } catch {
      failed++;
    }
  }
  return { saved, failed };
}
