import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { SmsInbox } from './native';

// Fixed for a build, so it's asked once per app run.
let known: boolean | undefined;

/** Like `useSmsAvailable`, but undefined while the check is still running (e.g. to wait before redirecting). */
export function useSmsAvailability(): boolean | undefined {
  const android = Capacitor.getPlatform() === 'android';
  const [available, setAvailable] = useState<boolean | undefined>(android ? known : false);
  useEffect(() => {
    if (!android || known !== undefined) return;
    let live = true;
    SmsInbox.isAvailable()
      .then((r) => {
        known = r.available;
        if (live) setAvailable(r.available);
      })
      .catch(() => live && setAvailable(false));
    return () => {
      live = false;
    };
  }, [android]);
  return available;
}

/** True on Android builds that declare READ_SMS; false elsewhere (iOS, web, release builds before Play approval). */
export function useSmsAvailable(): boolean {
  return useSmsAvailability() === true;
}
