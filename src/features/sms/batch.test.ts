import '@/test/setup-db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { alive, BudgyDB } from '@/core/db/db';
import type { TxDraft } from '@/features/transactions/txRecord';
import type { SmsPending } from '@/shared/models';
import { actionsFor, duplicatesOf, importMany } from './batch';

// A text whose fingerprint is 'boom' fails to save, as a broken write would; every other one saves for real.
vi.mock('./learning', async (original) => {
  const real = await original<typeof import('./learning')>();
  return {
    ...real,
    importText: (item: SmsPending, ...rest: [never, BudgyDB]) =>
      item.fingerprint === 'boom' ? Promise.reject(new Error('write failed')) : real.importText(item, ...rest),
  };
});

const database = new BudgyDB('t-batch');

const item = (over: Partial<SmsPending> = {}): SmsPending => ({
  fingerprint: 'a', smsId: '1', address: 'CIB', date: '2026-11-06T09:15:00.000Z', body: 'text', status: 'understood',
  amount: 450, currency: 'EGP', direction: 'out', merchant: 'CARREFOUR', digits: '4821', ...over,
});
const draft = (it: SmsPending, over: Partial<TxDraft> = {}): TxDraft => ({
  type: 'expense', amount: it.amount!, currency: it.currency!, accountId: 'a1', categoryId: 'c1', date: it.date, smsFingerprint: it.fingerprint, ...over,
});

beforeEach(async () => {
  await Promise.all([database.transactions.clear(), database.smsPending.clear(), database.smsLinks.clear(), database.merchantRules.clear()]);
});

describe('actionsFor', () => {
  const none = { sameCategory: false, combine: false, takeOff: false };

  it('offers nothing for an empty selection', () => {
    expect(actionsFor([])).toEqual(none);
  });

  it('offers the same category only when every text goes the same way', () => {
    expect(actionsFor([item({ direction: 'in' }), item({ fingerprint: 'b', direction: 'in' })]).sameCategory).toBe(true);
    expect(actionsFor([item({ direction: 'in' }), item({ fingerprint: 'b', direction: 'out' })]).sameCategory).toBe(false);
  });

  it('offers combining only for two or more texts', () => {
    expect(actionsFor([item()]).combine).toBe(false);
    expect(actionsFor([item(), item({ fingerprint: 'b', direction: 'in' })]).combine).toBe(true);
  });

  it('offers taking off a purchase only when every text is money in', () => {
    expect(actionsFor([item({ direction: 'in' })]).takeOff).toBe(true);
    expect(actionsFor([item({ direction: 'in' }), item({ fingerprint: 'b' })]).takeOff).toBe(false);
  });

  it('offers nothing when a text could not be read', () => {
    expect(actionsFor([item(), item({ fingerprint: 'b', status: 'unreadable', amount: undefined })])).toEqual(none);
  });
});

describe('importMany', () => {
  it('saves each text, learns its link and drops it from pending', async () => {
    const a = item();
    const b = item({ fingerprint: 'b', amount: 90 });
    await database.smsPending.bulkPut([a, b]);
    const result = await importMany([{ item: a, draft: draft(a) }, { item: b, draft: draft(b) }], database);
    expect(result).toEqual({ saved: 2, failed: 0 });
    const saved = (await database.transactions.toArray()).filter(alive);
    expect(saved.map((t) => t.smsFingerprint).sort()).toEqual(['a', 'b']);
    expect(await database.smsPending.count()).toBe(0);
    expect(await database.smsLinks.count()).toBe(1);
  });

  it('saves a text only once when run twice', async () => {
    const a = item();
    await importMany([{ item: a, draft: draft(a) }], database);
    await importMany([{ item: a, draft: draft(a) }], database);
    expect(await database.transactions.count()).toBe(1);
  });

  it('keeps going past a text that fails, and counts it', async () => {
    const bad = item({ fingerprint: 'boom' });
    const good = item({ fingerprint: 'b' });
    const result = await importMany([{ item: bad, draft: draft(bad) }, { item: good, draft: draft(good) }], database);
    expect(result).toEqual({ saved: 1, failed: 1 });
    expect((await database.transactions.toArray()).map((t) => t.smsFingerprint)).toEqual(['b']);
  });
});

describe('duplicatesOf', () => {
  it('returns the texts that match a hand-entered transaction on the same day', async () => {
    const a = item();
    const b = item({ fingerprint: 'b', amount: 90 });
    await database.transactions.add({ type: 'expense', amount: 450, currency: 'EGP', accountId: 'a1', categoryId: 'c1', date: '2026-11-06T15:00:00.000Z', createdAt: 'x' });
    const found = await duplicatesOf([{ fingerprint: 'a', draft: draft(a) }, { fingerprint: 'b', draft: draft(b) }], database);
    expect([...found.keys()]).toEqual(['a']);
    expect(found.get('a')?.kind).toBe('manual');
  });

  it('includes texts that match an instalment already recorded', async () => {
    await database.accounts.put({
      id: 'card', name: 'Card', type: 'card', icon: 'card', color: '#000', currency: 'EGP', initialBalance: 0, order: 0,
      credit: { statementDay: 25, dueDay: 20 }, createdAt: 'x',
    });
    await database.transactions.add({
      type: 'expense', amount: 450, currency: 'EGP', accountId: 'card', categoryId: 'c1', date: '2026-10-30T10:00:00.000Z',
      instalment: { planId: 'p', n: 2, of: 6 }, createdAt: 'x',
    });
    const a = item();
    const found = await duplicatesOf([{ fingerprint: 'a', draft: draft(a, { accountId: 'card' }) }], database);
    expect(found.get('a')?.kind).toBe('instalment');
  });
});
