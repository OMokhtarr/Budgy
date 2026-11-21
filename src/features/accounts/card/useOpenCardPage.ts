import { useCallback } from 'react';
import { useIonRouter } from '@ionic/react';
import { preloadCardPage } from '@/core/db/hooks';
import { pageSlide } from '@/shared/pageSlide';

/**
 * Opens a credit card's page, sliding in over the one it's opened from. The card is read first (a few
 * milliseconds), so the page is complete from its first frame rather than filling in as it slides.
 */
export function useOpenCardPage(): (cardId: string) => void {
  const router = useIonRouter();
  return useCallback(
    (cardId: string) => {
      const open = () => router.push(`/cards/${cardId}`, 'forward', 'push', undefined, pageSlide);
      preloadCardPage(cardId).then(open, open);
    },
    [router],
  );
}
