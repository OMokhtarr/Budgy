import { useRef, type MouseEvent, type PointerEvent } from 'react';

/**
 * Tap and long-press (or right-click) handlers for list items. Returns a function that
 * gives the handlers for one item, so a single hook serves a whole list.
 */
export function useLongPress<T>(onLongPress: (item: T) => void, onTap: (item: T) => void, ms = 500) {
  const timer = useRef<number | undefined>(undefined);
  const fired = useRef(false);
  const origin = useRef<{ x: number; y: number } | null>(null);

  const cancel = () => {
    window.clearTimeout(timer.current);
    origin.current = null;
  };
  const longPress = (item: T) => {
    cancel();
    fired.current = true;
    onLongPress(item);
  };

  return (item: T) => ({
    onPointerDown: (e: PointerEvent) => {
      fired.current = false;
      origin.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => longPress(item), ms);
    },
    // Scrolling the list isn't a long press.
    onPointerMove: (e: PointerEvent) => {
      if (origin.current && Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    // Right-click on desktop; Android also fires this on long-press, so don't trigger twice.
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault();
      if (!fired.current) longPress(item);
    },
    onClick: () => {
      if (fired.current) {
        fired.current = false;
        return;
      }
      onTap(item);
    },
  });
}
