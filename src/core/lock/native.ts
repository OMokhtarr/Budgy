import { Capacitor, registerPlugin } from '@capacitor/core';
import { BiometryType, NativeBiometric } from '@capgo/capacitor-native-biometric';

/** The app lock is Android only for now; the web version (for testing) never locks. */
export const lockSupported = Capacitor.getPlatform() === 'android';

/** Whether the phone has a screen lock. A failed check counts as no, so Budgy opens rather than shutting the owner out. */
export async function isPhoneSecure(): Promise<boolean> {
  try {
    return (await NativeBiometric.isAvailable({ useFallback: true })).deviceIsSecure;
  } catch {
    return false;
  }
}

/**
 * Shows the phone's own unlock prompt: fingerprint, face, or the phone's PIN, pattern or password
 * (BIOMETRIC_WEAK | DEVICE_CREDENTIAL). True once unlocked; false when cancelled or failed.
 */
export async function verifyOwner(title: string): Promise<boolean> {
  try {
    await NativeBiometric.verifyIdentity({
      title,
      allowedBiometryTypes: [BiometryType.MULTIPLE, BiometryType.DEVICE_CREDENTIAL],
      // Android's most: one misread fingerprint shouldn't close the prompt before the PIN can be used.
      maxAttempts: 5,
    });
    return true;
  } catch {
    return false;
  }
}

/** The app's own `AppPrivacy` plugin (android/app/.../AppPrivacyPlugin.java). */
interface AppPrivacyPlugin {
  setRecentsHidden(options: { hidden: boolean }): Promise<void>;
  elapsedRealtime(): Promise<{ ms: number }>;
}

const AppPrivacy = registerPlugin<AppPrivacyPlugin>('AppPrivacy');

/**
 * The app lock's clock: time since the phone booted, sleep included, so setting the phone's time back can't
 * shorten the time away. Falls back to the wall clock if the plugin is missing.
 */
export async function uptimeNow(): Promise<number> {
  try {
    return (await AppPrivacy.elapsedRealtime()).ms;
  } catch {
    return Date.now();
  }
}

/** Hides Budgy's preview in the recent-apps screen (Android 13+; older versions keep it). */
export async function setRecentsHidden(hidden: boolean): Promise<void> {
  if (!lockSupported) return;
  try {
    await AppPrivacy.setRecentsHidden({ hidden });
  } catch {
    /* an older build without the plugin: the preview stays */
  }
}
