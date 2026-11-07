import '@/test/setup-db';
import { beforeEach, describe, expect, it } from 'vitest';
import { BudgyDB } from '@/core/db/db';
import type { Transaction } from '@/shared/models';
import type { SmsMessage } from './parser/types';
import { fingerprintOf, scanInbox, sinceOf } from './scan';

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
    const texts = ['a', 'b', 'c', 'd'].map((x, i) => msg({ id: String(i), body: `${DEBIT} ${x}` }));
    const [fa, fb, fc] = await Promise.all(texts.slice(0, 3).map(fingerprintOf));
    await database.smsSeen.put({ fingerprint: fa, outcome: 'dismissed', at: 'x' });
    await database.transactions.add({ id: 't1', smsFingerprint: fb, deletedAt: 'x' } as unknown as Transaction);
    await database.smsPending.put({ fingerprint: fc, smsId: '2', address: 'CIB', date: 'x', body: 'y', status: 'understood' });
    expect((await run(texts)).added).toBe(1);
    expect(await database.smsPending.count()).toBe(2);
  });

  it('skips by fingerprint, not by SMS id', async () => {
    await run([msg()]);
    expect((await run([msg({ body: `${DEBIT} again` })])).added).toBe(1);
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
  it('uses the last scan, or a week when there is none', () => {
    expect(sinceOf('sinceLast', now, '2026-05-14T08:00:00.000Z')).toBe(Date.parse('2026-05-14T08:00:00.000Z'));
    expect(sinceOf('sinceLast', now, undefined)).toBe(sinceOf('1w', now));
  });
});
