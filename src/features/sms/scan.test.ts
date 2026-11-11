import '@/test/setup-db';
import { beforeEach, describe, expect, it } from 'vitest';
import { BudgyDB } from '@/core/db/db';
import type { Transaction } from '@/shared/models';
import type { SmsMessage } from './parser/types';
import { autoScanDue, fingerprintOf, scanInbox, sinceOf } from './scan';

const database = new BudgyDB('t-scan');

const DEBIT = 'Your card **4821 was debited with EGP 450.00 at CARREFOUR MAADI on 03/11/2026 10:15';
const msg = (over: Partial<SmsMessage> = {}): SmsMessage =>
  ({ id: '1', address: 'CIB', date: Date.parse('2026-11-03T10:15:00.000Z'), body: DEBIT, ...over });
const fakeList = (messages: SmsMessage[]) => async () => ({ messages });
const run = (messages: SmsMessage[], senders = ['cib']) =>
  scanInbox({ since: 0, senders }, { list: fakeList(messages), database });

describe('scanInbox', () => {
  beforeEach(() => Promise.all([database.smsPending.clear(), database.smsSeen.clear(), database.transactions.clear()]));

  it('keeps matching senders and drops ignored texts', async () => {
    const res = await run([
      msg(),
      msg({ id: '2', body: 'Your OTP is 482913. Do not share it with anyone' }),
      msg({ id: '3', address: 'Vodafone', body: DEBIT }),
    ]);
    expect(res.added).toBe(1);
    expect(await database.smsPending.count()).toBe(1);
  });

  it('skips texts already pending, dismissed or imported, even when deleted', async () => {
    const texts = [0, 1, 2, 3].map((i) => msg({ id: String(i), date: msg().date + i * 60_000 }));
    const [fa, fb, fc] = await Promise.all(texts.slice(0, 3).map(fingerprintOf));
    await database.smsSeen.put({ fingerprint: fa, outcome: 'dismissed', at: 'x' });
    await database.transactions.add({ id: 't1', smsFingerprint: fb, deletedAt: 'x' } as unknown as Transaction);
    await database.smsPending.put({ fingerprint: fc, smsId: '2', address: 'CIB', date: 'x', body: 'y', status: 'understood' });
    expect((await run(texts)).added).toBe(1);
    expect(await database.smsPending.count()).toBe(2);
  });

  it('skips by fingerprint, not by SMS id', async () => {
    await run([msg()]);
    expect((await run([msg({ date: msg().date + 1 })])).added).toBe(1);
  });

  it('fingerprints a text without its message', async () => {
    expect(await fingerprintOf(msg({ body: 'other words' }))).toBe(await fingerprintOf(msg()));
    expect(await fingerprintOf(msg({ address: 'NBE' }))).not.toBe(await fingerprintOf(msg()));
  });

  it('adds each text once even when two scans overlap', async () => {
    await Promise.all([run([msg()]), run([msg()])]);
    expect(await database.smsPending.count()).toBe(1);
  });

  it('stores unreadable texts with what was found', async () => {
    await run([msg({ body: 'Payment of EGP 99.00 pending review' })]);
    const [row] = await database.smsPending.toArray();
    expect(row).toMatchObject({ status: 'unreadable', smsId: '1', address: 'CIB', date: '2026-11-03T10:15:00.000Z', amount: 99, currency: 'EGP' });
  });
});

describe('sinceOf', () => {
  const now = new Date(2026, 4, 15, 10, 0);
  it('counts calendar months and days back', () => {
    expect(sinceOf('1m', now)).toBe(new Date(2026, 3, 15, 10, 0).getTime());
    expect(sinceOf('3d', now)).toBe(new Date(2026, 4, 12, 10, 0).getTime());
  });
  it("stops at the end of a shorter month instead of running into the next", () => {
    expect(sinceOf('1m', new Date(2026, 2, 31, 10, 0))).toBe(new Date(2026, 1, 28, 10, 0).getTime());
    expect(sinceOf('3m', new Date(2026, 4, 31, 10, 0))).toBe(new Date(2026, 1, 28, 10, 0).getTime());
    expect(sinceOf('6m', new Date(2026, 7, 31, 10, 0))).toBe(new Date(2026, 1, 28, 10, 0).getTime());
  });
  it('uses the last scan, or a week when there is none', () => {
    expect(sinceOf('sinceLast', now, '2026-05-14T08:00:00.000Z')).toBe(Date.parse('2026-05-14T08:00:00.000Z'));
    expect(sinceOf('sinceLast', now, undefined)).toBe(sinceOf('1w', now));
  });
});

describe('autoScanDue', () => {
  const now = new Date('2026-11-11T12:00:00.000Z');

  it('scans when there was no scan before', () => {
    expect(autoScanDue(undefined, now)).toBe(true);
    expect(autoScanDue('not a date', now)).toBe(true);
  });

  it('skips when the last scan was under a minute ago', () => {
    expect(autoScanDue('2026-11-11T11:59:30.000Z', now)).toBe(false);
    expect(autoScanDue('2026-11-11T11:59:00.000Z', now)).toBe(true);
  });

  it('scans when the last scan is in the future, e.g. after the clock was turned back', () => {
    expect(autoScanDue('2026-11-12T12:00:00.000Z', now)).toBe(true);
  });
});
