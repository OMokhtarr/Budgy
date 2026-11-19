import { Capacitor } from '@capacitor/core';

/**
 * The build switch for Budgy Pro. Read at call time, not at import, so tests can stub the env and the platform.
 * 'off' = today's app, RevenueCat never starts; 'test' = paywall and purchases work but nothing is locked;
 * 'on' = the real gate.
 */
export type ProMode = 'off' | 'test' | 'on';

/** The RevenueCat public SDK key for this platform: the iOS key on iOS, the Android key otherwise; '' when unset. */
export function revenueCatKey(): string {
  const key =
    Capacitor.getPlatform() === 'ios'
      ? import.meta.env.VITE_REVENUECAT_IOS_KEY
      : import.meta.env.VITE_REVENUECAT_ANDROID_KEY;
  return key ?? '';
}

/** Anything but an explicit 'test' / 'on', on a native platform with a key, is off (RevenueCat has no web build here). */
export function proMode(): ProMode {
  const gate = import.meta.env.VITE_PRO_GATE;
  if (gate !== 'test' && gate !== 'on') return 'off';
  if (!Capacitor.isNativePlatform() || !revenueCatKey()) return 'off';
  return gate;
}

export function proAvailable(): boolean {
  return proMode() !== 'off';
}

export function isProGateOn(): boolean {
  return proMode() === 'on';
}
