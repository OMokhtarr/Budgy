import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { App as CapApp } from '@capacitor/app';
import { useSettings } from '@/core/contexts/SettingsContext';
import { createLockController, type ConfirmResult, type LockView } from './lockController';
import { isPhoneSecure, lockSupported, setRecentsHidden, uptimeNow, verifyOwner } from './native';
import LockCover from './LockCover';

interface AppLockValue {
  /** Whether this device can use the app lock (the Android app). */
  supported: boolean;
  /** Asks the owner to unlock once, for turning the lock on or off in Settings. */
  confirm(): Promise<ConfirmResult>;
}

const UNSUPPORTED: AppLockValue = { supported: false, confirm: async () => 'cancelled' };
const AppLockContext = createContext<AppLockValue>(UNSUPPORTED);

/** Above the overlays (100) and the menu (99), so back on the cover leaves the app instead of closing them. */
const BACK_PRIORITY = 1000;

/** The app lock: asks for the phone's own unlock on start and after time away, and covers the app meanwhile. */
export function LockProvider({ children }: { children: React.ReactNode }) {
  if (!lockSupported) return <AppLockContext.Provider value={UNSUPPORTED}>{children}</AppLockContext.Provider>;
  return <NativeLock>{children}</NativeLock>;
}

function NativeLock({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { appLock } = useSettings();
  const settingsRef = useRef(appLock);
  const tRef = useRef(t);
  useEffect(() => {
    settingsRef.current = appLock;
    tRef.current = t;
  });
  // Covered from the first render, so nothing shows before the prompt.
  const [view, setView] = useState<LockView>(() => (appLock.enabled ? 'locked' : 'open'));

  const controller = useMemo(
    () =>
      createLockController({
        now: uptimeNow,
        settings: () => settingsRef.current,
        isSecure: isPhoneSecure,
        verify: () => verifyOwner(tRef.current('lock.promptTitle')),
        onView: setView,
      }),
    [],
  );

  useEffect(() => {
    controller.start();
    // Leaving and coming back, not pause/resume: the unlock prompt pauses Budgy without leaving it.
    const handle = CapApp.addListener('appStateChange', ({ isActive }) =>
      isActive ? void controller.comeBack() : controller.leave(),
    );
    return () => void handle.then((l) => l.remove());
  }, [controller]);

  // While covered, the app behind can't be read by TalkBack, focused or typed into (also drops the keyboard).
  useEffect(() => {
    const app = document.querySelector('ion-app');
    if (!app) return;
    app.inert = view !== 'open';
    return () => {
      app.inert = false;
    };
  }, [view]);

  useEffect(() => {
    void setRecentsHidden(appLock.enabled);
  }, [appLock.enabled]);

  useEffect(() => {
    if (view === 'open') return;
    const onBack = (e: Event) =>
      (e as CustomEvent).detail.register(BACK_PRIORITY, () => void CapApp.exitApp());
    document.addEventListener('ionBackButton', onBack);
    return () => document.removeEventListener('ionBackButton', onBack);
  }, [view]);

  const value = useMemo<AppLockValue>(() => ({ supported: true, confirm: controller.confirm }), [controller]);

  return (
    <AppLockContext.Provider value={value}>
      {children}
      {/* Outside ion-app, so it stays usable while the app behind it is inert. */}
      {createPortal(<LockCover view={view} onUnlock={() => void controller.unlock()} />, document.body)}
    </AppLockContext.Provider>
  );
}

export function useAppLock() {
  return useContext(AppLockContext);
}
