import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { menuController } from '@ionic/core/components';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { moveItem } from '@/core/utils/reorder';

/** How long to hold an item before it can be dragged; a shorter touch is a tap or a scroll. */
const HOLD_MS = 350;
/** Moving more than this before the hold ends is a scroll, not a drag. */
const SLOP = 10;

/** Keeps the next `type` event (if it comes soon) from reaching the page. */
function swallowNext(type: 'click' | 'touchend') {
  const stop = (e: Event) => {
    e.stopPropagation();
    if (type === 'click') e.preventDefault();
  };
  window.addEventListener(type, stop, { capture: true, once: true });
  window.setTimeout(() => window.removeEventListener(type, stop, { capture: true }), 400);
}

/**
 * Hold an item, then drag it over the others: it follows the finger and takes the place of whichever
 * one is under it, and `onMove` gets the new order when it's let go. `ids` is the current order; each
 * item needs `itemProps(id)`. While an item is lifted the page doesn't scroll, swipe to another period
 * or open the side menu.
 */
export function useDragReorder(ids: string[], onMove: (ids: string[]) => void, enabled = true) {
  const [draft, setDraft] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  /** Ends the press in progress, if any, without saving. */
  const stop = useRef<(() => void) | null>(null);
  /** Keeps the lifted item under the finger, also after the others moved around it. */
  const follow = useRef<(() => void) | null>(null);

  useEffect(() => () => stop.current?.(), []);
  // The list just took a new order, so the lifted item's own place moved: put it back under the finger.
  useLayoutEffect(() => follow.current?.(), [draft]);
  useEffect(() => {
    if (!enabled) stop.current?.();
  }, [enabled]);

  const press = (id: string, e: PointerEvent) => {
    if (!enabled || e.button !== 0 || stop.current) return;
    const { pointerId, pointerType } = e;
    const el = e.currentTarget as HTMLElement;
    const origin = { x: e.clientX, y: e.clientY };
    const finger = { ...origin };
    // Where the item was grabbed, and how far it's drawn from its own place in the list.
    let grab = { x: 0, y: 0 };
    let shift = { x: 0, y: 0 };
    const place = () => {
      const r = el.getBoundingClientRect();
      shift = { x: finger.x - grab.x - (r.left - shift.x), y: finger.y - grab.y - (r.top - shift.y) };
      el.style.transform = `translate(${shift.x}px, ${shift.y}px)`;
    };
    let order = ids;
    let lifted = false;
    const listeners = new AbortController();
    const on = listeners.signal;

    const end = () => {
      window.clearTimeout(timer);
      listeners.abort();
      stop.current = null;
      follow.current = null;
      el.style.removeProperty('transform');
      el.style.removeProperty('pointer-events');
      setDragging(null);
      setDraft(null);
      if (!lifted) return;
      void menuController.swipeGesture(true);
      // Dropping an item doesn't also open it, and a sideways drag doesn't change the period: the page's
      // swipe listens for touchend, which comes right after pointerup.
      swallowNext('click');
      if (pointerType === 'touch') swallowNext('touchend');
    };
    stop.current = end;

    const timer = window.setTimeout(() => {
      lifted = true;
      const r = el.getBoundingClientRect();
      grab = { x: origin.x - r.left, y: origin.y - r.top };
      // Out of the way, so the finger finds the item under it.
      el.style.pointerEvents = 'none';
      follow.current = place;
      setDragging(id);
      setDraft(order);
      void menuController.swipeGesture(false);
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    }, HOLD_MS);

    window.addEventListener(
      'pointermove',
      (ev) => {
        if (ev.pointerId !== pointerId) return;
        if (!lifted) {
          if (Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y) > SLOP) end();
          return;
        }
        finger.x = ev.clientX;
        finger.y = ev.clientY;
        place();
        const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-reorder-id]');
        const next = over?.dataset.reorderId ? moveItem(order, id, over.dataset.reorderId) : order;
        if (next !== order) {
          order = next;
          setDraft(next);
        }
      },
      { signal: on },
    );
    window.addEventListener(
      'pointerup',
      (ev) => {
        if (ev.pointerId !== pointerId) return;
        if (lifted && order.join() !== ids.join()) onMove(order);
        end();
      },
      { signal: on },
    );
    window.addEventListener('pointercancel', (ev) => ev.pointerId === pointerId && end(), { signal: on });
    // Once lifted, the finger moves the item instead of scrolling the page.
    window.addEventListener('touchmove', (ev) => lifted && ev.cancelable && ev.preventDefault(), { signal: on, passive: false });
  };

  const itemProps = (id: string) => ({
    'data-reorder-id': id,
    onPointerDown: (e: PointerEvent) => press(id, e),
    // A long press would otherwise open the browser's menu or select text.
    onContextMenu: enabled ? (e: MouseEvent) => e.preventDefault() : undefined,
  });

  return { order: draft ?? ids, dragging, itemProps };
}
