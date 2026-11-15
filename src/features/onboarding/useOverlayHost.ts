import { useLayoutEffect, useState } from 'react';

/**
 * Where the onboarding layers portal to: inside ion-app, like Ionic's own overlays, so a toast
 * (z-index 60000+) still stacks above them, which it could not from outside ion-app. Falls back to
 * the body. Null on the first render, because ion-app is only in the document after mount; it is
 * resolved in a layout effect, before paint.
 */
export function useOverlayHost(): Element | null {
  const [host, setHost] = useState<Element | null>(null);
  useLayoutEffect(() => setHost(document.querySelector('ion-app') ?? document.body), []);
  return host;
}
