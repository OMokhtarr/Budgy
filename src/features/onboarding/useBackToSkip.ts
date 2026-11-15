import { useEffect, useRef } from 'react';

/** Above the pages' own back handlers (they use 100), so back reaches the onboarding first. */
const BACK_PRIORITY = 200;

/**
 * While enabled, the hardware back button calls `onSkip` instead of going back. Always calls the
 * latest `onSkip`, so callers can pass a fresh function on every render.
 */
export function useBackToSkip(onSkip: () => void, enabled = true): void {
  const skipRef = useRef(onSkip);
  useEffect(() => {
    skipRef.current = onSkip;
  });

  useEffect(() => {
    if (!enabled) return;
    const onBack = (e: Event) => (e as CustomEvent).detail.register(BACK_PRIORITY, () => skipRef.current());
    document.addEventListener('ionBackButton', onBack);
    return () => document.removeEventListener('ionBackButton', onBack);
  }, [enabled]);
}
