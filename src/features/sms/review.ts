import type { Converter } from '@/core/contexts/SettingsContext';
import { alive, db, type BudgyDB } from '@/core/db/db';
import { categoryFits } from '@/core/db/hooks';
import { currenciesOf, groupOf } from '@/core/utils/currency';
import { rateToSave } from '@/core/utils/txRate';
import type { TxDraft } from '@/features/transactions/txRecord';
import type { Account, Category, Flow, SmsPending } from '@/shared/models';
import { flowOf, type Suggestion } from './learning';

/** What the user picked on a card's chips. A person (a debt account) takes the category's place: the text is lending. */
export interface CardPick {
  accountId?: string;
  categoryId?: string;
  personId?: string;
}

/** What a card saves: the suggestion with the user's picks on top, or an account and a person. */
export interface CardChoice extends Suggestion {
  personId?: string;
}

/** A debt account that can still be picked as the person a text lends to or is paid back by. */
export const isPerson = (a: Account) => alive(a) && !a.archived && groupOf(a) === 'debt';

/**
 * The picks whose target can still be used: an account that's there and not archived, a category that's
 * there, not archived and fits the flow. Others (deleted or archived since they were picked) are dropped,
 * so the card falls back to the suggestion. A person is kept while they're still a live, unarchived debt.
 */
export function usablePick(pick: CardPick | undefined, flow: Flow, accounts: Account[], categories: Category[]): CardPick {
  const out: CardPick = {};
  if (pick?.accountId && accounts.some((a) => a.id === pick.accountId && alive(a) && !a.archived)) out.accountId = pick.accountId;
  const category = pick?.categoryId && categories.find((c) => c.id === pick.categoryId);
  if (category && alive(category) && !category.archived && categoryFits(category, flow)) out.categoryId = category.id;
  if (pick?.personId && accounts.some((a) => a.id === pick.personId && isPerson(a))) out.personId = pick.personId;
  return out;
}

/**
 * The suggestion with the user's picks on top. Picking another category drops the suggested subcategory, which
 * belongs to the suggested one; picking a person drops the category altogether.
 */
export function choiceOf(s: Suggestion, pick: CardPick = {}): CardChoice {
  const accountId = pick.accountId ?? s.accountId;
  if (pick.personId) return { accountId, personId: pick.personId };
  const ownCategory = pick.categoryId == null || pick.categoryId === s.categoryId;
  return {
    accountId,
    ...(ownCategory ? { categoryId: s.categoryId, subcategoryId: s.subcategoryId } : { categoryId: pick.categoryId }),
  };
}

/**
 * The transaction a card's Confirm saves, or undefined while something it needs is missing (Confirm stays disabled).
 * With a person picked it's a transfer: money out is lent (account → person), money in is paid back (person → account).
 * That needs `person`, the picked debt account, to keep the text's currency; otherwise the editor asks for both amounts.
 */
export function cardDraft(item: SmsPending, choice: CardChoice, conv: Pick<Converter, 'base' | 'rate'>, person?: Account): TxDraft | undefined {
  const { amount, currency } = item;
  if (item.status !== 'understood' || !(amount && amount > 0) || !currency || !choice.accountId) return undefined;
  const common = { amount, currency, date: item.date, note: item.merchant, smsFingerprint: item.fingerprint };

  if (choice.personId) {
    if (!person || person.id !== choice.personId || person.id === choice.accountId || !currenciesOf(person).includes(currency)) return undefined;
    const lent = flowOf(item) === 'expense';
    return {
      type: 'transfer',
      ...common,
      accountId: lent ? choice.accountId : person.id,
      toAccountId: lent ? person.id : choice.accountId,
    };
  }

  if (!choice.categoryId) return undefined;
  return {
    type: flowOf(item),
    ...common,
    accountId: choice.accountId,
    categoryId: choice.categoryId,
    subcategoryId: choice.subcategoryId,
    rate: rateToSave({ saved: conv.rate(currency), currency, base: conv.base }),
  };
}

/** "+ New person" on a card: a debt account with just a name, in the text's currency, nothing owed yet. Returns its id. */
export async function addPerson(name: string, currency: string, database: BudgyDB = db): Promise<string> {
  const id = await database.accounts.add({
    name: name.trim(),
    type: 'cash',
    group: 'debt',
    icon: 'user',
    color: '#3b82f6',
    currency,
    initialBalance: 0,
    order: await database.accounts.count(),
    createdAt: new Date().toISOString(),
  });
  if (id == null) throw new Error('The new person was not saved');
  return id;
}
