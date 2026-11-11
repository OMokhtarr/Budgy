import { useEffect, useRef } from 'react';
import { App as CapApp } from '@capacitor/app';
import { useSettings } from '@/core/contexts/SettingsContext';
import { SmsInbox } from './native';
import { autoScanDue } from './scan';
import { useInboxScan } from './useInboxScan';
import { useSmsAvailable } from './useSmsAvailable';

/**
 * With "Scan when the app opens" on, quietly scans since the last scan on launch and whenever the app
 * comes back. Shows nothing: new texts wait in Bank texts, and the menu avatar gets a dot.
 */
export default function AutoScan() {
  const available = useSmsAvailable();
  const { smsImport } = useSettings();
  const runScan = useInboxScan();
  // Waits for a bank sender: a scan with none finds nothing but still moves lastScanAt, so the first real
  // scan would no longer reach back a week.
  const on = available && smsImport.enabled && !!smsImport.autoScan && smsImport.senders.length > 0;
  // Read when the app opens, so a new lastScanAt doesn't re-register the listener.
  const lastScanAt = useRef(smsImport.lastScanAt);
  lastScanAt.current = smsImport.lastScanAt;
  // Kept outside the effect so a re-run of it (e.g. switching it off and on) can't start a second scan.
  const running = useRef(false);

  useEffect(() => {
    if (!on) return;
    const run = async () => {
      if (running.current || !autoScanDue(lastScanAt.current, new Date())) return;
      running.current = true;
      try {
        // Without permission there's nothing to read; Settings shows that the permission is gone.
        const { sms } = await SmsInbox.checkPermissions();
        if (sms === 'granted') await runScan('sinceLast');
      } catch {
        // Quiet by design: the next open tries again.
      } finally {
        running.current = false;
      }
    };
    void run();
    const handle = CapApp.addListener('resume', () => void run());
    return () => {
      void handle.then((h) => h.remove());
    };
  }, [on, runScan]);

  return null;
}
