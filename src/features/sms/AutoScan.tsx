import { useEffect, useRef } from 'react';
import { useIonRouter } from '@ionic/react';
import { useLocation } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { proAllows } from '@/core/pro/rules';
import { usePro } from '@/core/pro/ProContext';
import { useSettings } from '@/core/contexts/SettingsContext';
import { useTours } from '@/features/onboarding/TourProvider';
import { SmsInbox } from './native';
import { autoScanDue, hasUnseenPending } from './scan';
import { useInboxScan } from './useInboxScan';
import { useSmsAvailable } from './useSmsAvailable';

const BANK_TEXTS = '/sms';

/** A sheet, dialog, menu or tour step is up: changing the page under it would pull the screen away mid-task. */
const somethingOpen = () =>
  !!document.querySelector(
    'ion-modal.show-modal, ion-menu.show-menu, ion-alert:not(.overlay-hidden), ion-action-sheet:not(.overlay-hidden), .ob-spot',
  );

/**
 * With "Scan when the app opens" on, quietly scans since the last scan on launch and whenever the app
 * comes back. When a scan has added texts that Bank texts hasn't shown yet, goes there.
 */
export default function AutoScan() {
  const available = useSmsAvailable();
  const { smsImport } = useSettings();
  const runScan = useInboxScan();
  const pro = usePro();
  // Waits for a bank sender: a scan with none finds nothing but still moves lastScanAt, so the first real
  // scan would no longer reach back a week.
  const on = available && smsImport.enabled && !!smsImport.autoScan && smsImport.senders.length > 0 && proAllows(pro);
  // Read when the app opens, so a new lastScanAt doesn't re-register the listener.
  const lastScanAt = useRef(smsImport.lastScanAt);
  lastScanAt.current = smsImport.lastScanAt;
  // Same for the router and the page showing, which change on every navigation.
  const router = useIonRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const { pathname } = useLocation();
  const where = useRef(pathname);
  where.current = pathname;
  // Kept outside the effect so a re-run of it (e.g. switching it off and on) can't start a second scan.
  const running = useRef(false);
  // A first scan waits for the slides (the welcome may still be changing the currency).
  const { deckOpen } = useTours();

  useEffect(() => {
    if (!on || deckOpen) return;
    const run = async () => {
      if (running.current) return;
      running.current = true;
      try {
        if (autoScanDue(lastScanAt.current, new Date())) {
          // Without permission there's nothing to read; Bank texts shows that the permission is gone.
          const { sms } = await SmsInbox.checkPermissions();
          if (sms === 'granted') await runScan('sinceLast');
        }
        // Also when no scan was due: texts a scan added while something was open still wait to be shown.
        if (where.current !== BANK_TEXTS && !somethingOpen() && (await hasUnseenPending())) {
          routerRef.current.push(BANK_TEXTS, 'forward');
        }
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
  }, [on, deckOpen, runScan]);

  return null;
}
