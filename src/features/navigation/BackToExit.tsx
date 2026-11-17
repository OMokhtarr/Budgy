import { useEffect } from 'react';
import { useIonToast } from '@ionic/react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useTranslation } from 'react-i18next';
import { EXIT_WINDOW_MS, createBackToExit } from './exitGate';

/**
 * Above the router's back handler (0), so the back button and back gesture never step back through
 * pages, and below the menu (99), overlays and selection modes (100), so those still close first.
 */
const BACK_PRIORITY = 10;

/** Back asks "press again to exit"; a second press within two seconds closes the app. */
export default function BackToExit() {
  const { t } = useTranslation();
  const [presentToast, dismissToast] = useIonToast();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const press = createBackToExit(
      () => void presentToast({ message: t('common.pressBackToExit'), duration: EXIT_WINDOW_MS, position: 'top', color: 'medium' }),
      () => {
        void dismissToast();
        void CapApp.exitApp();
      },
    );
    const onBack = (e: Event) => (e as CustomEvent).detail.register(BACK_PRIORITY, press);
    document.addEventListener('ionBackButton', onBack);
    return () => document.removeEventListener('ionBackButton', onBack);
  }, [t, presentToast, dismissToast]);

  return null;
}
