import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { registerSW } from 'virtual:pwa-register';
import { SettingsProvider } from '@/core/contexts/SettingsContext';
import { PeriodProvider } from '@/core/contexts/PeriodContext';
import { AccountFilterProvider } from '@/core/contexts/AccountFilterContext';
import { openData } from '@/core/db/db';
import DbError from '@/shared/components/DbError';
import { revealApp } from '@/shared/splash';
import { markFirstRun } from '@/features/onboarding/FirstRunCurrency';
import App from './App';
// Fonts ship with the app (no Google Fonts request): works offline and keeps "your data stays on this device" true.
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/noto-kufi-arabic/wght.css';
import './index.css';
import './core/i18n/config';

// The Workbox service worker isn't supported inside the Capacitor WebView;
// only register it for the web/PWA build. (The status bar style follows the theme, in SettingsContext.)
if (!Capacitor.isNativePlatform()) {
  registerSW({ immediate: true });
  // All data lives in IndexedDB; ask the browser not to evict it under storage pressure
  // (Safari otherwise clears it after 7 days without a visit).
  navigator.storage?.persist?.().catch(() => {});
}

openData()
  .then((fresh) => {
    if (fresh) markFirstRun();
    return true;
  })
  .catch((err) => {
    console.error('Budgy: could not open the local database', err);
    return false;
  })
  .then((dbOk) => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        {dbOk ? (
          <SettingsProvider>
            <PeriodProvider>
              <AccountFilterProvider>
                <App />
              </AccountFilterProvider>
            </PeriodProvider>
          </SettingsProvider>
        ) : (
          // Without the database every screen would just look empty, so say what happened.
          <DbError />
        )}
      </StrictMode>,
    );
    // The opening screen reveals the app once its data is in (useRevealWhen), so the splash goes straight
    // to a filled screen. Without the database there's nothing to wait for; the timer is a safety net.
    if (dbOk) setTimeout(revealApp, 3000);
    else revealApp();
  });
