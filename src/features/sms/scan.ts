import { BudgyDB, db } from '@/core/db/db';
import { sha256Hex } from '@/core/utils/id';
import type { SmsPending } from '@/shared/models';
import { parseSms } from './parser/parseSms';
import { matchesSender } from './parser/senders';
import type { SmsMessage } from './parser/types';

/** SHA-256 hex of sender, received time and body. */
export function fingerprintOf(msg: SmsMessage): Promise<string> {
  return sha256Hex(`${msg.address}\n${msg.date}\n${msg.body}`);
}

export type ScanPeriod = 'sinceLast' | '3d' | '1w' | '2w' | '1m' | '3m' | '6m';

const DAYS: Record<'3d' | '1w' | '2w', number> = { '3d': 3, '1w': 7, '2w': 14 };
const MONTHS: Record<'1m' | '3m' | '6m', number> = { '1m': 1, '3m': 3, '6m': 6 };

/** Start of the period in ms; 'sinceLast' uses lastScanAt (falls back to '1w' when there's none). */
export function sinceOf(period: ScanPeriod, now: Date, lastScanAt?: string): number {
  if (period === 'sinceLast') {
    const last = lastScanAt ? Date.parse(lastScanAt) : NaN;
    return Number.isNaN(last) ? sinceOf('1w', now) : last;
  }
  const d = new Date(now);
  if (period in DAYS) d.setDate(d.getDate() - DAYS[period as keyof typeof DAYS]);
  else d.setMonth(d.getMonth() - MONTHS[period as keyof typeof MONTHS]);
  return d.getTime();
}

export interface ScanDeps {
  list: (o: { since: number }) => Promise<{ messages: SmsMessage[] }>;
  database?: BudgyDB;
}

/** Reads matching texts since `since` into smsPending; returns how many are new. */
export async function scanInbox(opts: { since: number; senders: string[] }, deps: ScanDeps): Promise<{ added: number }> {
  const database = deps.database ?? db;
  const { messages } = await deps.list({ since: opts.since });

  const candidates: { msg: SmsMessage; fingerprint: string }[] = [];
  for (const msg of messages) {
    if (matchesSender(msg.address, opts.senders)) candidates.push({ msg, fingerprint: await fingerprintOf(msg) });
  }
  if (!candidates.length) return { added: 0 };

  const keys = candidates.map((c) => c.fingerprint);
  return database.transaction('rw', database.smsPending, database.smsSeen, database.transactions, async () => {
    const [pending, seen, imported] = await Promise.all([
      database.smsPending.bulkGet(keys),
      database.smsSeen.bulkGet(keys),
      database.transactions.where('smsFingerprint').anyOf(keys).toArray(),
    ]);
    const known = new Set<string>(imported.map((t) => t.smsFingerprint as string));
    keys.forEach((k, i) => { if (pending[i] || seen[i]) known.add(k); });

    const rows: SmsPending[] = [];
    for (const { msg, fingerprint } of candidates) {
      if (known.has(fingerprint)) continue;
      known.add(fingerprint);
      const parsed = parseSms(msg.address, msg.body);
      if (parsed.status === 'ignored') continue;
      const { status, amount, currency, direction, merchant, digits } = parsed;
      rows.push({
        fingerprint, smsId: msg.id, address: msg.address, date: new Date(msg.date).toISOString(), body: msg.body,
        status, amount, currency, direction, merchant, digits,
      });
    }
    await database.smsPending.bulkPut(rows);
    return { added: rows.length };
  });
}
