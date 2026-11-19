import { useEffect, useRef } from 'react';
import { useIonRouter, useIonToast } from '@ionic/react';
import { useLocation } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useTranslation } from 'react-i18next';
import { EXIT_WINDOW_MS, backFallback, createBackToExit } from './exitGate';

/**
 * Above the router's back handler (0), so the back button and back gesture never step back through
 * the tabs, and below the menu (99), overlays and selection modes (100), so those still close first.
 */
const BACK_PRIORITY = 10;

/**
 * On a tab, back asks "press again to exit" and a second press within two seconds closes the app.
 * On a page opened on top of the tabs (Profile, Settings, Data, bank texts), back leaves that page
 * the way its on-screen back arrow does.
 */
export default function BackToExit() {
  const { t } = useTranslation();
  const [presentToast, dismissToast] = useIonToast();
  const router = useIonRouter();
  const { pathname } = useLocation();
  const pathRef = useRef(pathname);
  const routerRef = useRef(router);
  useEffect(() => {
    pathRef.current = pathname;
    routerRef.current = router;
  });

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const askToExit = createBackToExit(
      () => void presentToast({ message: t('common.pressBackToExit'), duration: EXIT_WINDOW_MS, position: 'top', color: 'medium' }),
      () => {
        void dismissToast();
        void CapApp.exitApp();
      },
    );
    const press = () => {
      const fallback = backFallback(pathRef.current);
      if (fallback === null) return askToExit();
      const r = routerRef.current;
      if (r.canGoBack()) r.goBack();
      else r.push(fallback, 'back');
    };
    const onBack = (e: Event) => (e as CustomEvent).detail.register(BACK_PRIORITY, press);
    document.addEventListener('ionBackButton', onBack);
    return () => document.removeEventListener('ionBackButton', onBack);
  }, [t, presentToast, dismissToast]);

  return null;
}
