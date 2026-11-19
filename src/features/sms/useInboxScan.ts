import { useCallback, useRef } from 'react';
import { useSettings } from '@/core/contexts/SettingsContext';
import { SmsInbox } from './native';
import { scanInbox, sinceOf, type ScanPeriod } from './scan';

/**
 * Scans the inbox for `period` into the review list and saves the scan time as lastScanAt.
 * Returns how many texts are new. Expects the SMS permission to be granted already.
 */
export function useInboxScan(): (period: ScanPeriod) => Promise<number> {
  const { smsImport, updateSms } = useSettings();
  // Read when the scan starts, so the callback doesn't change with every settings change.
  const latest = useRef(smsImport);
  latest.current = smsImport;

  return useCallback(
    async (period) => {
      const started = new Date();
      const { lastScanAt, senders, ignoreWords } = latest.current;
      const { added } = await scanInbox(
        { since: sinceOf(period, started, lastScanAt), senders, ignore: ignoreWords ?? [] },
        { list: (o) => SmsInbox.list(o) },
      );
      updateSms({ lastScanAt: started.toISOString() });
      return added;
    },
    [updateSms],
  );
}
