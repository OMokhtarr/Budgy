/**
 * Pure onboarding rules, kept out of the components so they can be tested
 * without React: which deck opens at launch, which tour runs next, where the
 * card sits, which element a step points at.
 */
import type { OnboardingState } from './onboardingStore';
import type { Release, TourId } from './tourCatalog';

/** `replay` is the welcome replayed from Settings: no currency slide, and finishing changes nothing. */
export type Deck = { kind: 'welcome'; replay: boolean } | { kind: 'whatsNew'; releases: Release[] } | null;

/** Each update's features not yet seen; updates with none left are dropped. */
export function unseenReleases(state: OnboardingState, releases: Release[]): Release[] {
  return releases
    .map((r) => ({ ...r, features: r.features.filter((f) => !state.seenReleases.includes(f.key)) }))
    .filter((r) => r.features.length > 0);
}

export function launchDeck(state: OnboardingState | null, releases: Release[]): Deck {
  if (!state) return null;
  if (!state.welcomeDone) return { kind: 'welcome', replay: false };
  const fresh = unseenReleases(state, releases);
  return fresh.length > 0 ? { kind: 'whatsNew', releases: fresh } : null;
}

export function pendingTours(state: OnboardingState | null, ids: TourId[]): TourId[] {
  if (!state) return [];
  return ids.filter((id) => !state.seenTours.includes(id));
}

export interface TourRequest {
  tourId: TourId;
  /** May start while a sheet is open: the tour belongs to that sheet. */
  overOverlay: boolean;
  onBeforeStart?: () => void;
}

/** Index of the first request allowed to start now, or -1. */
export function pickNext(queue: TourRequest[], overlayOpen: boolean): number {
  return queue.findIndex((r) => r.overOverlay || !overlayOpen);
}

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Space between the ring and its target. */
export const RING_PAD = 6;
/** The ring's border, drawn outside its box (box-shadow spread). */
const RING_LINE = 2;
/** Room kept between the ring and a screen edge: the border + 1px. */
const RING_EDGE = RING_LINE + 1;
/** Phones round their screen corners (a Redmi Note 11 Pro by 37 CSS px). A
 *  ring reaching this close to the bottom keeps CORNER_EDGE from the sides
 *  (and from the bottom, without a gesture bar) so the rounding can't clip
 *  its 12px corners. */
const CORNER_ZONE = 40;
const CORNER_EDGE = 10;

/** Where a card may sit, in viewport pixels: a top card's top edge and a bottom card's bottom edge. */
export interface CardZone {
  top: number;
  bottom: number;
}

/**
 * The card sits at the bottom when it fits there below the ring, at the top when it fits above
 * it, and otherwise on the side with more room around the ring. `ring` is the box from ringBox,
 * whose 2px line is drawn just outside it, so the card keeps clear of that line too.
 */
export function cardPlacement(ring: Box, cardHeight: number, zone: CardZone): 'top' | 'bottom' {
  const ringTop = ring.top - RING_LINE;
  const ringBottom = ring.top + ring.height + RING_LINE;
  if (zone.bottom - cardHeight >= ringBottom) return 'bottom';
  if (zone.top + cardHeight <= ringTop) return 'top';
  return ringTop - zone.top > zone.bottom - ringBottom ? 'top' : 'bottom';
}

/**
 * The spotlight ring: RING_PAD outside the target, but pulled in on any side
 * that would leave the visible screen. Without this a full-width header, the
 * bottom nav or a button flush with a screen edge has part of its ring drawn
 * off-screen, under the status bar or into a rounded screen corner.
 *
 * `safe` is the screen minus the system bars. The ring may dip 1px into the
 * gesture bar (its line then sits just below a bottom bar's labels and above
 * the gesture handle), but stays out of the status bar, whose icons would
 * cover it. A full-width bar gets no padding above or below, so the ring lies
 * along the bar's own border instead of leaving a strip of page between them.
 * A target wholly off the visible screen keeps the plain padded ring.
 */
export function ringBox(target: Box, safe: Box, screen: { width: number; height: number }): Box {
  const pad = RING_PAD;
  const fullWidth = target.left <= safe.left + 1 && target.left + target.width >= safe.left + safe.width - 1;
  const padY = fullWidth ? 0 : pad;
  const top = Math.max(target.top - padY, safe.top + RING_EDGE);
  const bottomLimit = Math.min(safe.top + safe.height + 1, screen.height - CORNER_EDGE);
  const bottom = Math.min(target.top + target.height + padY, bottomLimit);
  const sideEdge = bottom + RING_LINE > screen.height - CORNER_ZONE ? CORNER_EDGE : RING_EDGE;
  const left = Math.max(target.left - pad, safe.left + sideEdge);
  const right = Math.min(target.left + target.width + pad, safe.left + safe.width - sideEdge);
  if (bottom <= top || right <= left) {
    return { top: target.top - pad, left: target.left - pad, width: target.width + pad * 2, height: target.height + pad * 2 };
  }
  return { top, left, width: right - left, height: bottom - top };
}

export function unionBox(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  const top = Math.min(...boxes.map((b) => b.top));
  const left = Math.min(...boxes.map((b) => b.left));
  const bottom = Math.max(...boxes.map((b) => b.top + b.height));
  const right = Math.max(...boxes.map((b) => b.left + b.width));
  return { top, left, width: right - left, height: bottom - top };
}

/**
 * Finds a step's target on the page the user is looking at. Ionic keeps
 * earlier pages mounted but hidden, and the bottom nav exists on every page,
 * so hidden copies and zero-size elements are ignored. Without `union` the
 * first visible match wins and the rest aren't measured (this runs every frame).
 */
export function resolveTarget(
  root: ParentNode,
  ref: string,
  union: boolean,
): { box: Box; element: Element } | null {
  const hits: { box: Box; element: Element }[] = [];
  for (const element of Array.from(root.querySelectorAll(`[data-tour~="${ref}"]`))) {
    if (element.closest('.ion-page-hidden, .ion-page-invisible')) continue;
    const r = element.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const hit = { element, box: { top: r.top, left: r.left, width: r.width, height: r.height } };
    if (!union) return hit;
    hits.push(hit);
  }
  if (hits.length === 0) return null;
  return { element: hits[0].element, box: unionBox(hits.map((h) => h.box)) as Box };
}

/**
 * A tour counts as seen once the user has been shown at least one step and
 * finished or skipped it. A tour cut short by navigation, or one whose targets
 * never appeared, stays unseen so it can run on the next visit.
 */
export function shouldMarkSeen(reason: 'done' | 'skip' | 'cancel', shownSteps: number): boolean {
  return reason !== 'cancel' && shownSteps > 0;
}

/**
 * The step after `from` whose target is on screen now, or null when none is —
 * which makes `from` the last step the user will see. Mid-tour gaps are
 * skipped at once instead of waiting out each missing step.
 */
export function nextShowable<S>(steps: S[], from: number, exists: (step: S) => boolean): number | null {
  for (let i = from + 1; i < steps.length; i++) if (exists(steps[i])) return i;
  return null;
}

/** The step 'Previous' returns to: the latest shown step before `index`. */
export function previousShown(shown: number[], index: number): number | null {
  const earlier = shown.filter((i) => i < index);
  return earlier.length > 0 ? Math.max(...earlier) : null;
}

/**
 * Anything that sits above the page: Ionic sheets, alerts, popovers, pickers,
 * the open side menu. A tour waits while one is up.
 */
export const OVERLAY_SELECTOR =
  'ion-modal:not(.overlay-hidden), ion-alert:not(.overlay-hidden), ion-popover:not(.overlay-hidden), ion-action-sheet:not(.overlay-hidden), ion-picker:not(.overlay-hidden), ion-loading:not(.overlay-hidden), ion-menu.show-menu';

/** True while an overlay is open or the page is in multi-select mode. */
export function isOverlayOpen(doc: Pick<Document, 'querySelector' | 'body'>): boolean {
  return doc.querySelector(OVERLAY_SELECTOR) !== null || doc.body.classList.contains('b-selecting');
}
