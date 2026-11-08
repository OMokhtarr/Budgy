import { describe, expect, it } from 'vitest';
import type { Account, Category, SmsPending } from '@/shared/models';
import { cardDraft, choiceOf, usablePick } from './review';

const conv = { base: 'EGP', rate: (c: string) => (c === 'EGP' ? 1 : c === 'USD' ? 50 : undefined) };

const account = (id: string, over: Partial<Account> = {}): Account =>
  ({ id, name: id, type: 'bank', icon: 'bank', color: '#000', currency: 'EGP', initialBalance: 0, order: 0, createdAt: 'x', ...over }) as Account;
const category = (id: string, over: Partial<Category> = {}): Category => ({ id, name: id, kind: 'expense', icon: 'cart', color: '#000', order: 0, ...over });

const item = (over: Partial<SmsPending> = {}): SmsPending => ({
  fingerprint: 'fp1',
  smsId: '7',
  address: 'CIB',
  date: '2026-11-06T09:15:00.000Z',
  body: 'Your card **4821 was charged EGP 450 at CARREFOUR MAADI',
  status: 'understood',
  amount: 450,
  currency: 'EGP',
  direction: 'out',
  merchant: 'CARREFOUR MAADI',
  digits: '4821',
  ...over,
});

describe('choiceOf', () => {
  const suggestion = { accountId: 'a1', categoryId: 'c1', subcategoryId: 's1' };

  it('keeps the suggestion when nothing was picked', () => {
    expect(choiceOf(suggestion)).toEqual(suggestion);
  });

  it('lets a pick override the suggestion, dropping the suggested subcategory with its category', () => {
    expect(choiceOf(suggestion, { accountId: 'a2', categoryId: 'c2' })).toEqual({ accountId: 'a2', categoryId: 'c2' });
  });

  it('keeps the subcategory when the suggested category is picked again', () => {
    expect(choiceOf(suggestion, { categoryId: 'c1' })).toEqual(suggestion);
  });
});

describe('usablePick', () => {
  const accounts = [account('a1'), account('a2', { archived: true }), account('a3', { deletedAt: '2026-11-07T00:00:00.000Z' })];
  const categories = [category('c1'), category('c2', { archived: true }), category('c3', { kind: 'income' }), category('c4', { kind: 'both' })];
  const suggestion = { accountId: 'a1', categoryId: 'c1', subcategoryId: 's1' };

  it('keeps picks that can still be used', () => {
    expect(usablePick({ accountId: 'a1', categoryId: 'c4' }, 'expense', accounts, categories)).toEqual({ accountId: 'a1', categoryId: 'c4' });
  });

  it('drops a picked account that was archived or deleted since, or a category that was archived or no longer fits', () => {
    expect(usablePick({ accountId: 'a2', categoryId: 'c2' }, 'expense', accounts, categories)).toEqual({});
    expect(usablePick({ accountId: 'a3', categoryId: 'c3' }, 'expense', accounts, categories)).toEqual({});
    expect(usablePick({ accountId: 'gone', categoryId: 'gone' }, 'expense', accounts, categories)).toEqual({});
  });

  it('falls back to the suggestion, or to nothing (Confirm disabled) when there is none', () => {
    const pick = usablePick({ accountId: 'a2', categoryId: 'c3' }, 'expense', accounts, categories);
    expect(choiceOf(suggestion, pick)).toEqual(suggestion);
    expect(cardDraft(item(), choiceOf({}, pick), conv)).toBeUndefined();
  });
});

describe('cardDraft', () => {
  const choice = { accountId: 'a1', categoryId: 'c1' };

  it('is undefined until both an account and a category are chosen', () => {
    expect(cardDraft(item(), { accountId: 'a1' }, conv)).toBeUndefined();
    expect(cardDraft(item(), { categoryId: 'c1' }, conv)).toBeUndefined();
  });

  it('is undefined for a text without an amount or currency, or one that could not be read', () => {
    expect(cardDraft(item({ amount: undefined }), choice, conv)).toBeUndefined();
    expect(cardDraft(item({ currency: undefined }), choice, conv)).toBeUndefined();
    expect(cardDraft(item({ status: 'unreadable' }), choice, conv)).toBeUndefined();
  });

  it("builds an expense at the text's own time, with the merchant as note and the fingerprint", () => {
    expect(cardDraft(item(), { ...choice, subcategoryId: 's1' }, conv)).toEqual({
      type: 'expense',
      amount: 450,
      currency: 'EGP',
      accountId: 'a1',
      categoryId: 'c1',
      subcategoryId: 's1',
      date: '2026-11-06T09:15:00.000Z',
      note: 'CARREFOUR MAADI',
      smsFingerprint: 'fp1',
      rate: {},
    });
  });

  it('makes money in an income, and a text with no direction an expense', () => {
    expect(cardDraft(item({ direction: 'in' }), choice, conv)?.type).toBe('income');
    expect(cardDraft(item({ direction: undefined }), choice, conv)?.type).toBe('expense');
  });

  it("keeps a foreign currency and saves today's rate with it", () => {
    const d = cardDraft(item({ amount: 20, currency: 'USD' }), choice, conv);
    expect(d).toMatchObject({ amount: 20, currency: 'USD', rate: { rate: 50, rateCurrency: 'EGP' } });
  });
});
