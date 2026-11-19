import { useCallback } from 'react';
import { useIonToast } from '@ionic/react';
import { useTranslation } from 'react-i18next';
import { usePro } from './ProContext';
import { requirePro, type PaywallOutcome } from './rules';

/**
 * The paywall on its own, whatever the gate: a purchase that errored or a paywall that couldn't open gets a toast;
 * a dismissed paywall just does nothing. Resolves to how it ended.
 */
export function usePaywall(): () => Promise<PaywallOutcome> {
  const { showPaywall } = usePro();
  const { t } = useTranslation();
  const [presentToast] = useIonToast();

  return useCallback(async () => {
    const outcome = await showPaywall();
    if (outcome === 'failed' || outcome === 'unavailable') {
      void presentToast({ message: t(`pro.${outcome}`), duration: 3000, position: 'top', color: 'danger' });
    }
    return outcome;
  }, [showPaywall, presentToast, t]);
}

/** Runs a Pro-only action: at once when allowed, otherwise after a paywall (see `usePaywall`) that ends subscribed. */
export function useRequirePro(): (action: () => void | Promise<void>) => Promise<void> {
  const { gateOn, isPro } = usePro();
  const paywall = usePaywall();

  return useCallback(
    async (action: () => void | Promise<void>) => {
      await requirePro({ gateOn, isPro }, paywall, action);
    },
    [gateOn, isPro, paywall],
  );
}
