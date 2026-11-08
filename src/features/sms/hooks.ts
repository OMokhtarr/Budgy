import { useLiveQuery } from 'dexie-react-hooks';
import { alive, db } from '@/core/db/db';
import type { MerchantRule, SmsLink, SmsPending } from '@/shared/models';

/** Bank texts waiting for review, newest first. */
export function usePendingSms(): SmsPending[] | undefined {
  return useLiveQuery(() => db.smsPending.orderBy('date').reverse().toArray());
}

/** How many bank texts wait for review (0 while loading). */
export function usePendingCount(): number {
  return useLiveQuery(() => db.smsPending.count(), [], 0);
}

/** The live learned links (sender + digits → account) and merchant rules (merchant + flow → category). */
export function useLearned(): { links: SmsLink[]; rules: MerchantRule[] } | undefined {
  return useLiveQuery(async () => {
    const [links, rules] = await Promise.all([db.smsLinks.filter(alive).toArray(), db.merchantRules.filter(alive).toArray()]);
    return { links, rules };
  });
}
