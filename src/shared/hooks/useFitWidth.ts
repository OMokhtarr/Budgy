import { useEffect, useLayoutEffect, useRef } from 'react';

/** Never shrinks text below this share of its normal size; past it the text is clipped. */
const MIN_SCALE = 0.6;

/** Brings `el` back to its stylesheet font size, then shrinks it until its text fits its width. */
function fit(el: HTMLElement) {
  el.style.fontSize = '';
  if (el.scrollWidth <= el.clientWidth || !el.clientWidth) return;
  const size = parseFloat(getComputedStyle(el).fontSize);
  const scale = Math.max(MIN_SCALE, Math.floor((el.clientWidth / el.scrollWidth) * 100) / 100);
  el.style.fontSize = `${size * scale}px`;
}

/**
 * Shrinks a one-line text (an amount, say) just enough to fit the width it's given, instead of letting it spill
 * into its neighbours or cutting digits off. The element needs a width limit (`max-width`) and `overflow: hidden`.
 * It is measured again when its text changes and when its parent is resized.
 */
export function useFitWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const fitted = useRef<string | null>(null);

  // Every render, but it only measures when the text changed.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || el.textContent === fitted.current) return;
    fitted.current = el.textContent;
    fit(el);
  });

  useEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => fit(el));
    observer.observe(parent);
    // The web font can arrive after the first measurement and is wider than the fallback.
    void document.fonts?.ready.then(() => fit(el));
    return () => observer.disconnect();
  }, []);

  return ref;
}
