import { describe, expect, it } from 'vitest';
import {
  OVERLAY_SELECTOR,
  cardPlacement,
  isOverlayOpen,
  launchDeck,
  nextShowable,
  pendingTours,
  pickNext,
  previousShown,
  resolveTarget,
  ringBox,
  shouldMarkSeen,
  unionBox,
  type TourRequest,
} from './tourLogic';
import type { Release } from './tourCatalog';

// One app update's announcements; a feature's key is what "seen" remembers.
const rel = (...keys: string[]): Release => ({
  features: keys.map((key) => ({ key, art: 'brand' as const, route: '/', tourId: 'categories' as const })),
});
const state = (over = {}) => ({ welcomeDone: true, seenTours: [] as string[], seenReleases: [] as string[], ...over });

describe('launchDeck', () => {
  it('shows nothing when storage is unusable', () => expect(launchDeck(null, [rel('a')])).toBeNull());
  it('shows the welcome until it is done', () =>
    expect(launchDeck(state({ welcomeDone: false }), [rel('a')])).toEqual({ kind: 'welcome', replay: false }));
  it('shows unseen features oldest first', () =>
    expect(launchDeck(state({ seenReleases: ['a'] }), [rel('a'), rel('b'), rel('c')])).toEqual({
      kind: 'whatsNew',
      releases: [rel('b'), rel('c')],
    }));
  it('shows only the unseen features of an update', () =>
    expect(launchDeck(state({ seenReleases: ['a'] }), [rel('a', 'b')])).toEqual({
      kind: 'whatsNew',
      releases: [rel('b')],
    }));
  it('shows nothing when everything is seen', () =>
    expect(launchDeck(state({ seenReleases: ['a', 'b'] }), [rel('a'), rel('b')])).toBeNull());
});

describe('pendingTours', () => {
  it('keeps unseen tours in the order given', () =>
    expect(pendingTours(state({ seenTours: ['accounts'] }), ['editor', 'accounts', 'sms'])).toEqual(['editor', 'sms']));
  it('returns nothing when storage is unusable', () => expect(pendingTours(null, ['categories'])).toEqual([]));
});

describe('pickNext', () => {
  const q: TourRequest[] = [
    { tourId: 'categories', overOverlay: false },
    { tourId: 'editor', overOverlay: true },
  ];
  it('takes the first request when nothing is open', () => expect(pickNext(q, false)).toBe(0));
  it('only takes over-overlay requests while a sheet is open', () => expect(pickNext(q, true)).toBe(1));
  it('returns -1 when nothing may run', () => expect(pickNext([q[0]], true)).toBe(-1));
});

const fakeDoc = (hit: boolean, selecting = false) =>
  ({
    querySelector: (s: string) => (hit && s === OVERLAY_SELECTOR ? ({} as Element) : null),
    body: { classList: { contains: (c: string) => selecting && c === 'b-selecting' } },
  }) as unknown as Document;

describe('isOverlayOpen', () => {
  it('an open sheet, alert or menu blocks tours', () => expect(isOverlayOpen(fakeDoc(true))).toBe(true));
  it('selection mode blocks tours', () => expect(isOverlayOpen(fakeDoc(false, true))).toBe(true));
  it('nothing open lets tours run', () => expect(isOverlayOpen(fakeDoc(false))).toBe(false));
});

describe('cardPlacement', () => {
  it('puts the card at the bottom for targets in the upper part', () =>
    expect(cardPlacement({ top: 10, left: 0, width: 40, height: 40 }, 800)).toBe('bottom'));
  it('moves the card to the top for targets in the lower 40%', () =>
    expect(cardPlacement({ top: 740, left: 0, width: 40, height: 40 }, 800)).toBe('top'));
});

describe('ringBox', () => {
  // A 400x800 phone with a 24px status bar and a 16px gesture bar.
  const screen = { width: 400, height: 800 };
  const safe = { top: 24, left: 0, width: 400, height: 760 };
  it('pads a target that sits clear of every edge', () =>
    expect(ringBox({ top: 100, left: 100, width: 50, height: 40 }, safe, screen)).toEqual({
      top: 94,
      left: 94,
      width: 62,
      height: 52,
    }));
  it('hugs a full-width header below the status bar, without a strip under it', () =>
    expect(ringBox({ top: 0, left: 0, width: 400, height: 80 }, safe, screen)).toEqual({
      top: 27,
      left: 3,
      width: 394,
      height: 53,
    }));
  it("runs a bottom bar's ring along its top border, clear of the corners", () =>
    expect(ringBox({ top: 720, left: 0, width: 400, height: 80 }, safe, screen)).toEqual({
      top: 720,
      left: 10,
      width: 380,
      height: 65,
    }));
  it("keeps a bottom-corner tab's ring out of the rounded screen corner", () =>
    expect(ringBox({ top: 723, left: 0, width: 65, height: 54 }, safe, screen)).toEqual({
      top: 717,
      left: 10,
      width: 61,
      height: 66,
    }));
  it('keeps clear of the bottom corners on a screen without a gesture bar', () =>
    expect(ringBox({ top: 720, left: 0, width: 400, height: 80 }, { ...safe, height: 776 }, screen)).toEqual({
      top: 720,
      left: 10,
      width: 380,
      height: 70,
    }));
  it('pulls in only the side that touches an edge', () =>
    expect(ringBox({ top: 40, left: 352, width: 44, height: 44 }, safe, screen)).toEqual({
      top: 34,
      left: 346,
      width: 51,
      height: 56,
    }));
  it('leaves the ring padded when the target is wholly outside the visible area', () =>
    expect(ringBox({ top: 0, left: 0, width: 400, height: 10 }, safe, screen)).toEqual({
      top: -6,
      left: -6,
      width: 412,
      height: 22,
    }));
});

describe('unionBox', () => {
  it('returns null for no boxes', () => expect(unionBox([])).toBeNull());
  it('covers every box', () =>
    expect(
      unionBox([
        { top: 10, left: 10, width: 20, height: 20 },
        { top: 5, left: 50, width: 10, height: 40 },
      ]),
    ).toEqual({ top: 5, left: 10, width: 50, height: 40 }));
});

describe('resolveTarget', () => {
  // The Node test environment has no DOM, so the page is a hand-made root.
  const el = (top: number, height = 20, hidden = false, id = '') => ({
    id,
    closest: (sel: string) => (hidden && sel.includes('ion-page-hidden') ? ({} as Element) : null),
    getBoundingClientRect: () => ({ top, left: 0, width: 50, height }),
  });
  const root = (...els: ReturnType<typeof el>[]) =>
    ({
      querySelectorAll: () => ({ forEach: (fn: (e: Element) => void) => els.forEach((e) => fn(e as unknown as Element)) }),
    }) as unknown as ParentNode;

  it('ignores copies inside hidden Ionic pages', () => {
    const hit = resolveTarget(root(el(1, 20, true, 'a'), el(700, 20, false, 'b')), 'categories.menu', false);
    expect((hit?.element as unknown as { id: string }).id).toBe('b');
  });
  it('skips zero-size elements', () => expect(resolveTarget(root(el(10, 0)), 'sms.scan', false)).toBeNull());
  it('unions every visible match when asked', () =>
    expect(resolveTarget(root(el(10), el(40)), 'accounts.tabs', true)?.box).toEqual({
      top: 10,
      left: 0,
      width: 50,
      height: 50,
    }));
});

describe('shouldMarkSeen', () => {
  it('marks a finished tour that showed something', () => expect(shouldMarkSeen('done', 2)).toBe(true));
  it('marks a skipped tour', () => expect(shouldMarkSeen('skip', 1)).toBe(true));
  it('leaves a tour whose targets never appeared unseen', () => expect(shouldMarkSeen('done', 0)).toBe(false));
  it('leaves a tour cut short by navigation unseen', () => expect(shouldMarkSeen('cancel', 3)).toBe(false));
});

describe('nextShowable', () => {
  const steps = [{ key: 'a' }, { key: 'b' }, { key: 'c' }, { key: 'd' }];
  const only = (...keys: string[]) => (s: { key: string }) => keys.includes(s.key);
  it('returns the very next step when its target exists', () => expect(nextShowable(steps, 0, only('b', 'c'))).toBe(1));
  it('skips steps whose targets are missing', () => expect(nextShowable(steps, 0, only('d'))).toBe(3));
  it('returns null when no later step can show', () => expect(nextShowable(steps, 1, only('a', 'b'))).toBeNull());
  it('returns null from the final step', () => expect(nextShowable(steps, 3, only('a', 'b', 'c', 'd'))).toBeNull());
});

describe('previousShown', () => {
  it('returns the latest shown step before the current one', () => expect(previousShown([0, 2, 3], 3)).toBe(2));
  it('returns null on the first shown step', () => expect(previousShown([1], 1)).toBeNull());
});
