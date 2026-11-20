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
    });
    return true;
  } catch {
    return false;
  }
}

/** The app's own `AppPrivacy` plugin (android/app/.../AppPrivacyPlugin.java). */
interface AppPrivacyPlugin {
  setRecentsHidden(options: { hidden: boolean }): Promise<void>;
}

const AppPrivacy = registerPlugin<AppPrivacyPlugin>('AppPrivacy');

/** Hides Budgy's preview in the recent-apps screen (Android 13+; older versions keep it). */
export async function setRecentsHidden(hidden: boolean): Promise<void> {
  if (!lockSupported) return;
  try {
    await AppPrivacy.setRecentsHidden({ hidden });
  } catch {
    /* an older build without the plugin: the preview stays */
  }
}
