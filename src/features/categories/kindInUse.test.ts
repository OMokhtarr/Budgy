import '@/test/setup-db';
import { beforeEach, describe, expect, it } from 'vitest';
import { BudgyDB } from '@/core/db/db';
import type { Transaction } from '@/shared/models';
import { usesOfOtherFlow } from './kindInUse';

const database = new BudgyDB('t-kind-in-use');
const add = (over: Partial<Transaction>) =>
  database.transactions.add({ type: 'expense', amount: 10, currency: 'EGP', accountId: 'cash', categoryId: 'mixed', date: '2026-11-01T10:00:00.000Z', createdAt: 'x', ...over });

beforeEach(() => database.transactions.clear());

describe('usesOfOtherFlow', () => {
  it('counts money back as spending, so it blocks making the category income-only', async () => {
    await add({ type: 'income', moneyBack: true });
    expect(await usesOfOtherFlow('mixed', 'income', database)).toBe(1);
  });

  it('lets a category with money back and purchases become expense-only', async () => {
    await add({ type: 'income', moneyBack: true });
    await add({});
    expect(await usesOfOtherFlow('mixed', 'expense', database)).toBe(0);
  });

  it('still counts plain income against expense-only, and skips deleted rows and other categories', async () => {
    await add({ type: 'income' });
    await add({ type: 'income', deletedAt: 'x' });
    await add({ type: 'income', categoryId: 'other' });
    expect(await usesOfOtherFlow('mixed', 'expense', database)).toBe(1);
  });
});
