import { useEffect, useRef } from 'react';
import { usePeriod } from '@/core/contexts/PeriodContext';
import { swipeStep } from '@/core/utils/swipe';

/** A drag starting this close to the side menu's edge opens the menu (Ionic's default for ion-menu). */
const MENU_EDGE = 50;

/** Slides the page in from the side the finger is moving away from. */
function slideIn(content: HTMLElement, deltaX: number) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const from = deltaX < 0 ? 24 : -24;
  content.querySelector('.b-page')?.animate(
    [{ transform: `translateX(${from}px)`, opacity: 0.4 }, { transform: 'none', opacity: 1 }],
    { duration: 180, easing: 'ease-out' },
  );
}

/**
 * Swiping sideways on a page's content moves to the previous or next page. Returns the ref for the
 * IonContent. Leave a callback out when there is nothing that way.
 *
 * Measures from touchstart to touchend. The browser throttles touchmove while a touch might be a
 * scroll, so Ionic's createGesture, which relies on it, reports quick swipes as covering no distance.
 */
export function useSwipe(onPrev?: () => void, onNext?: () => void) {
  const ref = useRef<HTMLIonContentElement>(null);
  const handlers = useRef({ onPrev, onNext });
  useEffect(() => {
    handlers.current = { onPrev, onNext };
  });

  useEffect(() => {
    const content = ref.current;
    if (!content) return;
    const isRtl = () => document.documentElement.dir === 'rtl';
    let start: { x: number; y: number; time: number } | null = null;

    const onTouchStart = (e: TouchEvent) => {
      const { clientX: x, clientY: y } = e.touches[0];
      const inMenuEdge = isRtl() ? x >= window.innerWidth - MENU_EDGE : x <= MENU_EDGE;
      // Dragging inside a text box moves the cursor.
      const inTextBox = (e.target as Element).closest?.('input, textarea');
      start = e.touches.length === 1 && !inMenuEdge && !inTextBox ? { x, y, time: e.timeStamp } : null;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!start) return;
      const { clientX, clientY } = e.changedTouches[0];
      const deltaX = clientX - start.x;
      const step = swipeStep(deltaX, clientY - start.y, e.timeStamp - start.time, isRtl());
      start = null;
      const action = step === 1 ? handlers.current.onNext : step === -1 ? handlers.current.onPrev : undefined;
      if (!action) return;
      action();
      slideIn(content, deltaX);
    };
    const onTouchCancel = () => {
      start = null;
    };

    const listeners = new AbortController();
    const options = { passive: true, signal: listeners.signal };
    content.addEventListener('touchstart', onTouchStart, options);
    content.addEventListener('touchend', onTouchEnd, options);
    content.addEventListener('touchcancel', onTouchCancel, options);
    return () => listeners.abort();
  }, []);

  return ref;
}

/** Swiping moves to the previous or next period, like the arrows. All time has nowhere to go. */
export function usePeriodSwipe(enabled = true) {
  const { mode, prev, next } = usePeriod();
  const canMove = enabled && mode !== 'all';
  return useSwipe(canMove ? prev : undefined, canMove ? next : undefined);
}
