import { useCallback } from 'react';
import { useIonToast } from '@ionic/react';
import { useTranslation } from 'react-i18next';
import { usePro } from './ProContext';
import { requirePro } from './rules';

/**
 * Runs a Pro-only action: at once when allowed, otherwise after a paywall that ends subscribed. A purchase that
 * errored or a paywall that couldn't open gets a toast; a dismissed paywall just does nothing.
 */
export function useRequirePro(): (action: () => void | Promise<void>) => Promise<void> {
  const { gateOn, isPro, showPaywall } = usePro();
  const { t } = useTranslation();
  const [presentToast] = useIonToast();

  return useCallback(
    async (action: () => void | Promise<void>) => {
      const outcome = await requirePro({ gateOn, isPro }, showPaywall, action);
      if (outcome === 'failed' || outcome === 'unavailable') {
        void presentToast({ message: t(`pro.${outcome}`), duration: 3000, position: 'top', color: 'danger' });
      }
    },
    [gateOn, isPro, showPaywall, presentToast, t],
  );
}
