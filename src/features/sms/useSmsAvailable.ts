import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { SmsInbox } from './native';

/** True on Android builds that declare READ_SMS; false elsewhere (iOS, web, release builds before Play approval). */
export function useSmsAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    let live = true;
    SmsInbox.isAvailable()
      .then((r) => live && setAvailable(r.available))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return available;
}
