import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';

let revealed = false;

/**
 * Takes the launch splash away, once: the native one in the phone app (held by `launchAutoHide: false`
 * in capacitor.config.ts), the HTML one (#budgy-splash in index.html) on the web.
 */
export function revealApp() {
  if (revealed) return;
  revealed = true;
  // Two frames: the first screen is painted before the splash starts to go, so it fades into the app
  // and not into a half-drawn page.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const splash = document.getElementById('budgy-splash');
      if (Capacitor.isNativePlatform()) {
        // The native splash covers the web view, so the HTML one was never seen there: drop it first.
        splash?.remove();
        SplashScreen.hide().catch(() => {});
        return;
      }
      if (!splash) return;
      splash.classList.add('budgy-splash--hidden');
      splash.addEventListener('transitionend', () => splash.remove(), { once: true });
      setTimeout(() => splash.remove(), 600);
    }),
  );
}

/** For the screen the app opens on: reveals the app once that screen's data has loaded. */
export function useRevealWhen(ready: boolean) {
  useEffect(() => {
    if (ready) revealApp();
  }, [ready]);
}
