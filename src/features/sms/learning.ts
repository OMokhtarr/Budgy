import { alive, db, type BudgyDB } from '@/core/db/db';
import { categoryFits } from '@/core/db/hooks';
import { idFromKey } from '@/core/utils/id';
import type { Account, Category, Flow, MerchantRule, SmsLink, SmsPending, SmsSeen, Transaction } from '@/shared/models';

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

const flowOf = (item: SmsPending): Flow => (item.direction === 'in' ? 'income' : 'expense');

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

/** After a text's transaction is saved: learn its link (and rule, for expense/income with a category), then drop the pending item. */
export async function resolveImported(item: SmsPending, tx: Transaction, database: BudgyDB = db): Promise<void> {
  const updatedAt = new Date().toISOString();
  const digits = item.digits || undefined;
  const linkId = await linkIdOf(item.address, digits);
  const link: SmsLink = { id: linkId, address: addressKey(item.address), accountId: tx.accountId, updatedAt, ...(digits ? { digits } : {}) };

  let rule: MerchantRule | undefined;
  if (tx.type !== 'transfer' && tx.categoryId && item.merchant) {
    const id = await ruleIdOf(item.merchant, tx.type);
    rule = {
      id,
      merchant: merchantKey(item.merchant),
      flow: tx.type,
      categoryId: tx.categoryId,
      updatedAt,
      ...(tx.subcategoryId ? { subcategoryId: tx.subcategoryId } : {}),
    };
  }

  await database.transaction('rw', database.smsLinks, database.merchantRules, database.smsPending, async () => {
    await database.smsLinks.put(link);
    if (rule) await database.merchantRules.put(rule);
    await database.smsPending.delete(item.fingerprint);
  });
}

/** Dismissed, or skipped as already added: remember it and drop the pending item (and its body). */
export async function resolveSkipped(item: SmsPending, outcome: SmsSeen['outcome'], database: BudgyDB = db): Promise<void> {
  await database.transaction('rw', database.smsSeen, database.smsPending, async () => {
    await database.smsSeen.put({ fingerprint: item.fingerprint, outcome, at: new Date().toISOString() });
    await database.smsPending.delete(item.fingerprint);
  });
}
