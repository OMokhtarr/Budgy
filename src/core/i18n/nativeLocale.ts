import { App } from '@capacitor/app';
import { Capacitor, registerPlugin } from '@capacitor/core';

export type Lang = 'ar' | 'en';

/** The app's own `AppLocale` plugin (android/app/.../AppLocalePlugin.java). */
interface AppLocalePlugin {
  setLanguage(options: { tag: string }): Promise<void>;
  getLanguage(): Promise<{ tag: string }>;
}

const AppLocale = registerPlugin<AppLocalePlugin>('AppLocale');

const supported = Capacitor.getPlatform() === 'android';

/** Budgy's language from Android's tag list ("ar-EG,en" → 'ar'); null when Android follows the phone. */
export function langFromTags(tags: string): Lang | null {
  const first = tags.split(',')[0].trim().toLowerCase();
  if (first === 'ar' || first.startsWith('ar-')) return 'ar';
  if (first === 'en' || first.startsWith('en-')) return 'en';
  return null;
}

/**
 * Gives Android Budgy's language. Native screens, such as RevenueCat's paywall, take their direction from it,
 * not from the web app's dir="rtl", so Arabic reads right to left there even on a phone set to English.
 */
export async function setNativeLanguage(lang: Lang): Promise<void> {
  if (!supported) return;
  try {
    await AppLocale.setLanguage({ tag: lang });
  } catch (err) {
    console.warn('Budgy: setting the app language on Android failed', err);
  }
}

/**
 * Brings the two languages together. One picked in Android's settings (Apps → Budgy → Language) is adopted;
 * when Android has none yet, it is given Budgy's.
 */
export async function syncNativeLanguage(current: Lang, change: (lang: Lang) => unknown): Promise<void> {
  if (!supported) return;
  let android: Lang | null;
  try {
    android = langFromTags((await AppLocale.getLanguage()).tag);
  } catch (err) {
    console.warn('Budgy: reading the app language on Android failed', err);
    return;
  }
  if (!android) await setNativeLanguage(current);
  else if (android !== current) change(android);
}

/** Syncs now and each time Budgy comes back, since Android's setting can change while it's in the background. */
export function followNativeLanguage(current: () => Lang, change: (lang: Lang) => unknown): void {
  if (!supported) return;
  const sync = () => void syncNativeLanguage(current(), change);
  sync();
  App.addListener('resume', sync).catch((err) => console.warn('Budgy: app resume listener failed', err));
}
