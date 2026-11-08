import type { Converter } from '@/core/contexts/SettingsContext';
import { alive } from '@/core/db/db';
import { categoryFits } from '@/core/db/hooks';
import { rateToSave } from '@/core/utils/txRate';
import type { TxDraft } from '@/features/transactions/txRecord';
import type { Account, Category, Flow, SmsPending } from '@/shared/models';
import { flowOf, type Suggestion } from './learning';

/** What the user picked on a card's chips. */
export interface CardPick {
  accountId?: string;
  categoryId?: string;
}

/**
 * The picks whose target can still be used: an account that's there and not archived, a category that's
 * there, not archived and fits the flow. Others (deleted or archived since they were picked) are dropped,
 * so the card falls back to the suggestion.
 */
export function usablePick(pick: CardPick | undefined, flow: Flow, accounts: Account[], categories: Category[]): CardPick {
  const out: CardPick = {};
  if (pick?.accountId && accounts.some((a) => a.id === pick.accountId && alive(a) && !a.archived)) out.accountId = pick.accountId;
  const category = pick?.categoryId && categories.find((c) => c.id === pick.categoryId);
  if (category && alive(category) && !category.archived && categoryFits(category, flow)) out.categoryId = category.id;
  return out;
}

/** The suggestion with the user's picks on top. Picking another category drops the suggested subcategory, which belongs to the suggested one. */
export function choiceOf(s: Suggestion, pick: CardPick = {}): Suggestion {
  const ownCategory = pick.categoryId == null || pick.categoryId === s.categoryId;
  return {
    accountId: pick.accountId ?? s.accountId,
    ...(ownCategory ? { categoryId: s.categoryId, subcategoryId: s.subcategoryId } : { categoryId: pick.categoryId }),
  };
}

/** The transaction a card's Confirm saves, or undefined while something it needs is missing (Confirm stays disabled). */
export function cardDraft(item: SmsPending, choice: Suggestion, conv: Pick<Converter, 'base' | 'rate'>): TxDraft | undefined {
  const { amount, currency } = item;
  if (item.status !== 'understood' || !(amount && amount > 0) || !currency || !choice.accountId || !choice.categoryId) return undefined;
  return {
    type: flowOf(item),
    amount,
    currency,
    accountId: choice.accountId,
    categoryId: choice.categoryId,
    subcategoryId: choice.subcategoryId,
    date: item.date,
    note: item.merchant,
    smsFingerprint: item.fingerprint,
    rate: rateToSave({ saved: conv.rate(currency), currency, base: conv.base }),
  };
}
