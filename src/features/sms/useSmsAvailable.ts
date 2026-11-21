import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { SmsInbox } from './native';

// Fixed for a build, so it's asked once per app run.
let known: boolean | undefined;

/** Like `useSmsAvailable`, but undefined while the check is still running. */
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

/**
 * Whether Bank texts is in the menu and its page opens: on every Android build, so a fresh install always finds
 * it and can turn it on. A build without READ_SMS would list it too, but turning on would fail.
 */
export function bankTextsListed(): boolean {
  return Capacitor.getPlatform() === 'android';
}

/** True on Android builds that declare READ_SMS; false elsewhere (iOS, web). */
export function useSmsAvailable(): boolean {
  return useSmsAvailability() === true;
}
