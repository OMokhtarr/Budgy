import '@/test/setup-db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BudgyDB } from '@/core/db/db';
import { buildTxRecord, saveTx } from '@/features/transactions/txRecord';
import type { Account, Category, MerchantRule, SmsLink, SmsPending, Transaction } from '@/shared/models';
import { addressKey, importText, linkIdOf, merchantKey, resolveImported, resolveSkipped, ruleIdOf, suggestFor } from './learning';

const database = new BudgyDB('t-learning');

const item = (over: Partial<SmsPending> = {}): SmsPending => ({
  fingerprint: 'fp1', smsId: '1', address: 'CIB', date: '2026-11-01T10:00:00.000Z', body: 'secret text', status: 'understood',
  amount: 50, currency: 'EGP', direction: 'out', merchant: 'Carrefour Maadi 0231', digits: '4821', ...over,
});
const account = (id: string, over: Partial<Account> = {}): Account =>
  ({ id, name: id, type: 'bank', icon: 'bank', color: '#000', currency: 'EGP', initialBalance: 0, order: 0, createdAt: 'x', ...over }) as Account;
const category = (id: string, over: Partial<Category> = {}): Category =>
  ({ id, name: id, kind: 'expense', icon: 'cart', color: '#000', order: 0, subcategories: [{ id: 's1', name: 'S', icon: 'x' }], ...over });
const link = (address: string, accountId: string, digits?: string, over: Partial<SmsLink> = {}): SmsLink => ({ address, accountId, ...(digits ? { digits } : {}), ...over });
const rule = (categoryId: string, over: Partial<MerchantRule> = {}): MerchantRule => ({ merchant: 'CARREFOUR MAADI', flow: 'expense', categoryId, ...over });

describe('keys', () => {
  it('normalises merchants and addresses', async () => {
    expect(merchantKey('Carrefour  Maadi 0231')).toBe('CARREFOUR MAADI');
    expect(merchantKey('UBER #12-34')).toBe('UBER');
    expect(addressKey(' CIB ')).toBe('cib');
    expect(await linkIdOf('CIB', '4821')).toBe(await linkIdOf('cib', '4821'));
    expect(await linkIdOf('CIB', '4821')).not.toBe(await linkIdOf('CIB'));
    expect(await ruleIdOf('Uber 12', 'expense')).toBe(await ruleIdOf('UBER', 'expense'));
    expect(await ruleIdOf('Uber', 'expense')).not.toBe(await ruleIdOf('Uber', 'income'));
  });
});

describe('suggestFor', () => {
  const accounts = [account('a1'), account('a2', { archived: true }), account('a3', { deletedAt: 'x' })];
  const categories = [category('c1'), category('c2', { archived: true }), category('c3', { kind: 'income' })];

  it('suggests the linked account and the learned category', () => {
    const s = suggestFor(item(), [link('cib', 'a1', '4821')], [rule('c1', { subcategoryId: 's1' })], accounts, categories);
    expect(s).toEqual({ accountId: 'a1', categoryId: 'c1', subcategoryId: 's1' });
  });

  it('skips links and rules whose target is gone', () => {
    expect(suggestFor(item(), [link('cib', 'a3', '4821')], [], accounts, categories).accountId).toBeUndefined();
    expect(suggestFor(item(), [link('cib', 'a2', '4821')], [], accounts, categories).accountId).toBeUndefined();
    expect(suggestFor(item(), [], [rule('c2')], accounts, categories).categoryId).toBeUndefined();
    expect(suggestFor(item(), [], [rule('c3')], accounts, categories).categoryId).toBeUndefined();
  });

  it('uses the sender-only link only for texts without digits', () => {
    const links = [link('cib', 'a1')];
    expect(suggestFor(item(), links, [], accounts, categories).accountId).toBeUndefined();
    expect(suggestFor(item({ digits: undefined }), links, [], accounts, categories).accountId).toBe('a1');
    expect(suggestFor(item({ digits: undefined }), [link('cib', 'a1', '4821')], [], accounts, categories).accountId).toBeUndefined();
  });
});

const tx = (over: Partial<Transaction> = {}): Transaction =>
  ({ type: 'expense', amount: 50, currency: 'EGP', accountId: 'a1', categoryId: 'c1', subcategoryId: 's1', date: '2026-11-01T10:00:00.000Z', createdAt: 'x', ...over }) as Transaction;

describe('resolve', () => {
  it('learns a link and a rule, then removes the pending item', async () => {
    await database.smsPending.put(item());
    await resolveImported(item(), tx(), database);
    expect(await database.smsPending.get('fp1')).toBeUndefined();
    const l = await database.smsLinks.get(await linkIdOf('CIB', '4821'));
    expect(l).toMatchObject({ address: 'cib', digits: '4821', accountId: 'a1' });
    const r = await database.merchantRules.get(await ruleIdOf('Carrefour Maadi 0231', 'expense'));
    expect(r).toMatchObject({ merchant: 'CARREFOUR MAADI', flow: 'expense', categoryId: 'c1', subcategoryId: 's1' });
  });

  it('learns no rule from a transfer', async () => {
    await database.merchantRules.clear();
    await resolveImported(item({ fingerprint: 'fp2' }), tx({ type: 'transfer', categoryId: undefined, subcategoryId: undefined, toAccountId: 'a2' }), database);
    expect(await database.smsLinks.get(await linkIdOf('CIB', '4821'))).toBeTruthy();
    expect(await database.merchantRules.count()).toBe(0);
  });

  it('re-learning a link points it at the new account', async () => {
    const id = await linkIdOf('CIB', '4821');
    await database.smsLinks.update(id, { deletedAt: '2026-11-02T00:00:00.000Z' });
    await resolveImported(item(), tx({ accountId: 'a9' }), database);
    const l = await database.smsLinks.get(id);
    expect(l?.accountId).toBe('a9');
    expect(l?.deletedAt).toBeUndefined();
    expect(await database.smsLinks.count()).toBe(1);
  });

  it('re-learning a link stamps it later than a stamp from a phone whose clock runs ahead', async () => {
    const id = await linkIdOf('CIB', '4821');
    const ahead = '2099-01-01T00:00:00.000Z';
    await database.smsLinks.update(id, { updatedAt: ahead });
    await resolveImported(item(), tx({ accountId: 'a7' }), database);
    const l = await database.smsLinks.get(id);
    expect(l?.accountId).toBe('a7');
    expect(Date.parse(l!.updatedAt!)).toBeGreaterThan(Date.parse(ahead));
  });

  it('resolveSkipped remembers the text and deletes its body', async () => {
    await database.smsPending.put(item({ fingerprint: 'fp3' }));
    await resolveSkipped(item({ fingerprint: 'fp3' }), 'dismissed', database);
    expect(await database.smsPending.get('fp3')).toBeUndefined();
    expect(await database.smsSeen.get('fp3')).toMatchObject({ outcome: 'dismissed' });
  });
});

describe('importing a text is never done twice', () => {
  const record = (fingerprint: string) => buildTxRecord({ type: 'expense', amount: 50, currency: 'EGP', accountId: 'a1', categoryId: 'c1', date: '2026-11-01T10:00:00.000Z', smsFingerprint: fingerprint });
  const saved = (fingerprint: string) => database.transactions.where('smsFingerprint').equals(fingerprint).count();
  const failOnce = () => vi.spyOn(database.smsPending, 'delete').mockImplementationOnce(() => { throw new Error('boom'); });
  afterEach(() => vi.restoreAllMocks());

  it('a Confirm that fails saves nothing, and trying again saves one transaction and drops the pending item', async () => {
    const text = item({ fingerprint: 'fp-confirm' });
    await database.smsPending.put(text);
    failOnce();
    await expect(importText(text, record('fp-confirm'), database)).rejects.toThrow('boom');
    expect(await saved('fp-confirm')).toBe(0);
    expect(await database.smsPending.get('fp-confirm')).toBeTruthy();

    const tx = await importText(text, record('fp-confirm'), database);
    expect(tx.id).toBeTruthy();
    expect(await saved('fp-confirm')).toBe(1);
    expect(await database.smsPending.get('fp-confirm')).toBeUndefined();
  });

  it('a save from the editor whose learning fails, done again, ends with one transaction and no pending item', async () => {
    const text = item({ fingerprint: 'fp-editor' });
    await database.smsPending.put(text);
    failOnce();
    await expect(resolveImported(text, await saveTx(record('fp-editor'), undefined, database), database)).rejects.toThrow('boom');
    expect(await database.smsPending.get('fp-editor')).toBeTruthy();

    await resolveImported(text, await saveTx(record('fp-editor'), undefined, database), database);
    expect(await saved('fp-editor')).toBe(1);
    expect(await database.smsPending.get('fp-editor')).toBeUndefined();
  });
});
