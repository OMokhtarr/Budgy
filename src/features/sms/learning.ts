import { alive, db, type BudgyDB } from '@/core/db/db';
import { categoryFits } from '@/core/db/hooks';
import { idFromKey } from '@/core/utils/id';
import { stampAfter } from '@/core/utils/stamp';
import { saveTx } from '@/features/transactions/txRecord';
import type { Account, Category, Flow, MerchantRule, SmsLink, SmsPending, SmsSeen, Transaction } from '@/shared/models';
import type { Duplicate } from './duplicate';

/** Case-folded sender address; links and lookups use it. */
export function addressKey(address: string): string {
  return address.trim().toLowerCase();
}

/** Upper case, spaces collapsed, trailing branch/terminal numbers dropped: "Carrefour  Maadi 0231" → "CARREFOUR MAADI". */
export function merchantKey(merchant: string): string {
  const folded = merchant.trim().replace(/\s+/g, ' ').toUpperCase();
  const stripped = folded.replace(/(?:\s+[#-]*\d[\d#-]*)+$/, '').trim();
  return stripped || folded;
}

export function linkIdOf(address: string, digits?: string): Promise<string> {
  return idFromKey(`sms-link|${addressKey(address)}|${digits ?? ''}`);
}

export function ruleIdOf(merchant: string, flow: Flow): Promise<string> {
  return idFromKey(`merchant-rule|${flow}|${merchantKey(merchant)}`);
}

export interface Suggestion {
  accountId?: string;
  categoryId?: string;
  subcategoryId?: string;
}

/** Money in is income; out, or no direction, is an expense. */
export const flowOf = (item: SmsPending): Flow => (item.direction === 'in' ? 'income' : 'expense');

/** What to pre-fill for a pending text, from links and rules whose account / category still exist, aren't archived and fit. */
export function suggestFor(item: SmsPending, links: SmsLink[], rules: MerchantRule[], accounts: Account[], categories: Category[]): Suggestion {
  const out: Suggestion = {};
  const sender = addressKey(item.address);
  const digits = item.digits || undefined;
  const link = links.find((l) => alive(l) && l.address === sender && (l.digits || undefined) === digits);
  if (link && accounts.some((a) => a.id === link.accountId && alive(a) && !a.archived)) out.accountId = link.accountId;

  if (item.merchant) {
    const flow = flowOf(item);
    const merchant = merchantKey(item.merchant);
    const rule = rules.find((r) => alive(r) && r.flow === flow && r.merchant === merchant);
    const category = rule && categories.find((c) => c.id === rule.categoryId && alive(c) && !c.archived && categoryFits(c, flow));
    if (rule && category) {
      out.categoryId = category.id;
      if (rule.subcategoryId && category.subcategories?.some((s) => s.id === rule.subcategoryId && !s.archived)) out.subcategoryId = rule.subcategoryId;
    }
  }
  return out;
}

/**
 * The account the bank text is about. For a transfer from a text of money coming in (someone paying you back)
 * that's where the money arrived; otherwise it's where the money left from.
 */
const bankSideOf = (item: SmsPending, tx: Transaction) =>
  tx.type === 'transfer' && item.direction === 'in' && tx.toAccountId ? tx.toAccountId : tx.accountId;

/** The ids of the link and rule a text's transaction teaches. Hashed up front: a Dexie transaction can't wait on crypto. */
export interface LessonIds {
  linkId: string;
  rule?: { id: string; flow: Flow };
}

export async function lessonIdsOf(item: SmsPending, tx: Omit<Transaction, 'id'>): Promise<LessonIds> {
  const linkId = await linkIdOf(item.address, item.digits || undefined);
  // Money back is about who paid you, not where you spend: it teaches no category.
  if (tx.type === 'transfer' || tx.moneyBack || !tx.categoryId || !item.merchant) return { linkId };
  return { linkId, rule: { id: await ruleIdOf(item.merchant, tx.type), flow: tx.type } };
}

/**
 * Learns the link (and rule, for expense/income with a category), then drops the pending item. Runs inside a
 * rw transaction on smsLinks, merchantRules and smsPending. Stamps come after the stored ones, so a phone
 * whose clock is behind still counts as the latest edit.
 */
export async function learn(database: BudgyDB, item: SmsPending, tx: Transaction, ids: LessonIds): Promise<void> {
  const digits = item.digits || undefined;
  const oldLink = await database.smsLinks.get(ids.linkId);
  await database.smsLinks.put({
    id: ids.linkId,
    address: addressKey(item.address),
    accountId: bankSideOf(item, tx),
    updatedAt: stampAfter(oldLink?.updatedAt),
    ...(digits ? { digits } : {}),
  });

  // The ids were worked out for the record; a transaction already saved for this text may differ.
  if (ids.rule && tx.type === ids.rule.flow && tx.categoryId && item.merchant) {
    const oldRule = await database.merchantRules.get(ids.rule.id);
    const rule: MerchantRule = {
      id: ids.rule.id,
      merchant: merchantKey(item.merchant),
      flow: tx.type,
      categoryId: tx.categoryId,
      updatedAt: stampAfter(oldRule?.updatedAt),
      ...(tx.subcategoryId ? { subcategoryId: tx.subcategoryId } : {}),
    };
    await database.merchantRules.put(rule);
  }
  await database.smsPending.delete(item.fingerprint);
}

/** After a text's transaction is saved (by the editor): learn its link and rule, then drop the pending item. */
export async function resolveImported(item: SmsPending, tx: Transaction, database: BudgyDB = db): Promise<void> {
  const ids = await lessonIdsOf(item, tx);
  await database.transaction('rw', database.smsLinks, database.merchantRules, database.smsPending, () => learn(database, item, tx, ids));
}

/**
 * A card's Confirm: saves the text's transaction, learns from it and drops the pending item, all or nothing.
 * Returns the transaction (the one already saved for this text, if there is one).
 */
export async function importText(item: SmsPending, record: Omit<Transaction, 'id'>, database: BudgyDB = db): Promise<Transaction> {
  const ids = await lessonIdsOf(item, record);
  return database.transaction('rw', database.transactions, database.smsLinks, database.merchantRules, database.smsPending, async () => {
    const tx = await saveTx(record, undefined, database);
    await learn(database, item, tx, ids);
    return tx;
  });
}

/**
 * Skipped because it's already saved. A text that matches a planned instalment becomes that instalment's text: it takes
 * the text's fingerprint (so no later text matches it again) and is learned from like any import. Anything else is
 * remembered as a duplicate.
 */
export async function skipDuplicate(item: SmsPending, match: Duplicate | undefined, database: BudgyDB = db): Promise<void> {
  if (match?.kind !== 'instalment') return resolveSkipped(item, 'duplicate', database);
  const tx: Transaction = { ...match.tx, smsFingerprint: item.fingerprint };
  const ids = await lessonIdsOf(item, tx);
  const tables = [database.transactions, database.smsLinks, database.merchantRules, database.smsPending, database.smsSeen];
  await database.transaction('rw', tables, async () => {
    // Another text may have claimed it since the match was found (or it was deleted): then this one is just a duplicate.
    const now = await database.transactions.get(tx.id!);
    if (!now || !alive(now) || now.smsFingerprint) return resolveSkipped(item, 'duplicate', database);
    await database.transactions.update(tx.id!, { smsFingerprint: item.fingerprint });
    await learn(database, item, tx, ids);
  });
}

/** Dismissed, or skipped as already added: remember it and drop the pending item (and its body). */
export async function resolveSkipped(item: SmsPending, outcome: SmsSeen['outcome'], database: BudgyDB = db): Promise<void> {
  await database.transaction('rw', database.smsSeen, database.smsPending, async () => {
    await database.smsSeen.put({ fingerprint: item.fingerprint, outcome, at: new Date().toISOString() });
    await database.smsPending.delete(item.fingerprint);
  });
}
