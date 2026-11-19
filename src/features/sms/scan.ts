import { BudgyDB, db } from '@/core/db/db';
import { sha256Hex } from '@/core/utils/id';
import type { SmsPending } from '@/shared/models';
import { parseSms } from './parser/parseSms';
import { containsKeyword, matchesSender } from './parser/senders';
import type { SmsMessage } from './parser/types';

/**
 * SHA-256 hex of the sender and the received time (to the millisecond), which tell texts apart.
 * The body is left out on purpose: the fingerprint syncs on the transaction, and a hash of the body
 * would let anyone with the cloud copy confirm guesses about what the message said.
 */
export function fingerprintOf(msg: SmsMessage): Promise<string> {
  return sha256Hex(`${msg.address}\n${msg.date}`);
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
  if (period in DAYS) {
    d.setDate(d.getDate() - DAYS[period as keyof typeof DAYS]);
  } else {
    // Mar 31 back a month is Feb 28, not Mar 3: keep the day within the target month.
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() - MONTHS[period as keyof typeof MONTHS]);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  }
  return d.getTime();
}

/** Gap after a scan during which opening the app doesn't scan again, so switching apps back and forth stays quiet. */
const AUTO_SCAN_GAP_MS = 60_000;

/** Whether opening the app should scan now: no scan yet, or the last one is at least a minute old (or in the future). */
export function autoScanDue(lastScanAt: string | undefined, now: Date): boolean {
  const ago = now.getTime() - (lastScanAt ? Date.parse(lastScanAt) : NaN);
  return !(ago >= 0 && ago < AUTO_SCAN_GAP_MS);
}

export interface ScanDeps {
  list: (o: { since: number }) => Promise<{ messages: SmsMessage[] }>;
  database?: BudgyDB;
}

/** Whether a scan leaves the text out: the parser ignores it (e.g. an OTP), or it contains one of the user's ignore words. */
const isIgnored = (address: string, body: string, ignore: string[]) =>
  containsKeyword(body, ignore) || parseSms(address, body).status === 'ignored';

/**
 * Drops waiting texts a scan would now leave out: ones containing an ignore word, and ones the parser
 * now ignores, e.g. OTPs read as purchases before it learned their wording.
 */
export async function clearIgnoredPending(ignore: string[], database: BudgyDB = db): Promise<void> {
  await database.transaction('rw', database.smsPending, async () => {
    const stale = (await database.smsPending.toArray())
      .filter((row) => isIgnored(row.address, row.body, ignore))
      .map((row) => row.fingerprint);
    await database.smsPending.bulkDelete(stale);
  });
}

/** Reads matching texts since `since` into smsPending, leaving out ones with an `ignore` word; returns how many are new. */
export async function scanInbox(
  opts: { since: number; senders: string[]; ignore?: string[] },
  deps: ScanDeps,
): Promise<{ added: number }> {
  const database = deps.database ?? db;
  const ignore = opts.ignore ?? [];
  const { messages } = await deps.list({ since: opts.since });

  const candidates: { msg: SmsMessage; fingerprint: string }[] = [];
  for (const msg of messages) {
    if (matchesSender(msg.address, opts.senders) && !containsKeyword(msg.body, ignore)) {
      candidates.push({ msg, fingerprint: await fingerprintOf(msg) });
    }
  }
  await clearIgnoredPending(ignore, database);
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
        status, amount, currency, direction, merchant, digits, unseen: true,
      });
    }
    await database.smsPending.bulkPut(rows);
    return { added: rows.length };
  });
}

/** Whether a scan added texts that Bank texts hasn't shown yet. */
export async function hasUnseenPending(database: BudgyDB = db): Promise<boolean> {
  return (await database.smsPending.filter((row) => !!row.unseen).count()) > 0;
}

/** Marks every pending text as shown, keeping it in the list. */
export async function markPendingSeen(database: BudgyDB = db): Promise<void> {
  await database.transaction('rw', database.smsPending, async () => {
    const rows = await database.smsPending.filter((row) => !!row.unseen).toArray();
    await database.smsPending.bulkPut(rows.map(({ unseen: _, ...row }) => row));
  });
}
