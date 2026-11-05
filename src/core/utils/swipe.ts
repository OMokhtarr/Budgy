/** A drag at least this long counts as a swipe. */
const SWIPE_DISTANCE = 60;
/** A shorter drag counts only if it is at least this long and this fast (pixels per millisecond). */
const FLICK_DISTANCE = 30;
const FLICK_SPEED = 0.3;
/** Any more vertical than this (for each pixel sideways) is the user scrolling. */
const MAX_SLOPE = 2 / 3;

/**
 * Which way a finished drag moves: 1 = next page, -1 = previous page, 0 = stay.
 * The next page sits on the right, or on the left in right-to-left languages.
 */
export function swipeStep(deltaX: number, deltaY: number, ms: number, rtl: boolean): 1 | -1 | 0 {
  const distance = Math.abs(deltaX);
  if (Math.abs(deltaY) > distance * MAX_SLOPE) return 0;
  const isFlick = distance >= FLICK_DISTANCE && distance / ms >= FLICK_SPEED;
  if (distance < SWIPE_DISTANCE && !isFlick) return 0;
  return deltaX < 0 !== rtl ? 1 : -1;
}
