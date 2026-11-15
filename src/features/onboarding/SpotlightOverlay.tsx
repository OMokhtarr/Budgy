/**
 * One spotlight step: dims the screen, rings the target and explains it in a card above the tab bar
 * (or at the top, when the target sits low). The page underneath gets no taps while it is up; only
 * the card's buttons act.
 */
import { useEffect, useId, useRef, useState, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Dots } from './SlideDeck';
import type { Gesture, TourId, TourStep } from './tourCatalog';
import { cardPlacement, resolveTarget, ringBox, type Box } from './tourLogic';
import { useBackToSkip } from './useBackToSkip';
import { useOverlayHost } from './useOverlayHost';
import './onboarding.css';

/** How long a step waits for its target to appear before it is skipped. */
const FIND_TIMEOUT_MS = 1500;
const FIND_POLL_MS = 100;

const sameBox = (a: Box | null, b: Box) =>
  !!a && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;

/** The screen minus the system bars, read off the `.ob-safe` probe (which is inset by the
 *  safe-area insets); the whole window if it can't measure. */
const visibleBounds = (probe: HTMLElement | null): Box => {
  const r = probe?.getBoundingClientRect();
  if (r && r.width > 0 && r.height > 0) return { top: r.top, left: r.left, width: r.width, height: r.height };
  return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
};

/** A touch dot acting out the gesture over the target: a sliding trail for swipe, a filling ring
 *  for long-press, a ripple for tap, and for drag a press that then slides. */
function GestureHint({ gesture, box }: { gesture: Gesture; box: Box }) {
  return (
    <div
      className={`ob-touch ob-touch--${gesture}`}
      style={{ top: box.top + box.height / 2, left: box.left + box.width / 2 }}
      aria-hidden="true"
    >
      {(gesture === 'swipe' || gesture === 'drag') && <span className="ob-touch-trail" />}
      {gesture === 'longPress' && (
        <svg className="ob-touch-ring" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="17" pathLength={100} />
        </svg>
      )}
      {gesture === 'tap' && <span className="ob-touch-ripple" />}
      <span className="ob-touch-dot" />
    </div>
  );
}

interface Props {
  tourId: TourId;
  step: TourStep;
  index: number;
  total: number;
  canGoBack: boolean;
  isLast: boolean;
  onShown: () => void;
  onMissing: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}

export function SpotlightOverlay({
  tourId,
  step,
  index,
  total,
  canGoBack,
  isLast,
  onShown,
  onMissing,
  onNext,
  onPrev,
  onSkip,
}: Props) {
  const { t } = useTranslation();
  const host = useOverlayHost();
  const titleId = useId();
  const [box, setBox] = useState<Box | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const safeRef = useRef<HTMLDivElement>(null);
  const cb = useRef({ onShown, onMissing });
  useEffect(() => {
    cb.current = { onShown, onMissing };
  });

  // Looks for the target, scrolls it into view once, then follows it every frame (scrolling,
  // resizing, rotating); gives up after FIND_TIMEOUT_MS.
  useEffect(() => {
    const ref = `${tourId}.${step.key}`;
    const started = Date.now();
    let found = false;
    let scrolled = false;
    let frame = 0;
    let poll: number | undefined;

    const tick = () => {
      const hit = resolveTarget(document, ref, !!step.union);
      if (hit) {
        const vh = window.innerHeight;
        const offScreen = hit.box.top < 0 || hit.box.top + hit.box.height > vh;
        if (!scrolled && offScreen && hit.box.height < vh) {
          scrolled = true;
          hit.element.scrollIntoView({ block: 'center' });
        }
        setBox((prev) => (sameBox(prev, hit.box) ? prev : hit.box));
        if (!found) {
          found = true;
          cb.current.onShown();
        }
        frame = requestAnimationFrame(tick);
        return;
      }
      // A target that blinks out mid-step keeps its last ring.
      if (found) {
        frame = requestAnimationFrame(tick);
        return;
      }
      if (Date.now() - started > FIND_TIMEOUT_MS) {
        cb.current.onMissing();
        return;
      }
      poll = window.setTimeout(tick, FIND_POLL_MS);
    };

    tick();
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(poll);
    };
  }, [tourId, step.key, step.union]);

  const visible = box !== null && host !== null;
  // Back skips the tour only once it is on screen; while a target is still being looked for
  // nothing is drawn, so Back belongs to the page.
  useBackToSkip(onSkip, visible);
  useEffect(() => {
    if (!visible) return;
    // Over an open sheet (the editor tour) Ionic's focus trap would pull focus back into the
    // sheet, so the trap is switched off while the card is up, on exactly the sheets that had it
    // on. A sheet turns the class off again itself as it settles, so it is put back when that happens.
    const off = 'ion-disable-focus-trap';
    const sheets = Array.from(document.querySelectorAll('ion-modal:not(.overlay-hidden)')).filter(
      (m) => !m.classList.contains(off),
    );
    sheets.forEach((m) => m.classList.add(off));
    const keep = new MutationObserver(() =>
      sheets.forEach((m) => {
        if (!m.classList.contains(off)) m.classList.add(off);
      }),
    );
    sheets.forEach((m) => keep.observe(m, { attributes: true, attributeFilter: ['class'] }));
    cardRef.current?.focus();
    // A sheet still sliding in focuses itself just after it lands, which would take focus from the card.
    let later: number | undefined;
    const refocus = () => {
      window.clearTimeout(later);
      later = window.setTimeout(() => cardRef.current?.focus(), 50);
    };
    document.addEventListener('ionModalDidPresent', refocus);
    return () => {
      window.clearTimeout(later);
      document.removeEventListener('ionModalDidPresent', refocus);
      keep.disconnect();
      sheets.forEach((m) => m.classList.remove(off));
    };
  }, [visible]);

  if (!host) return null;

  const placement = box ? cardPlacement(box, window.innerHeight) : 'bottom';
  const ring = box
    ? ringBox(box, visibleBounds(safeRef.current), { width: window.innerWidth, height: window.innerHeight })
    : null;
  // Kept from the page and from Ionic's gestures, which listen on the document for touch and mouse
  // starts: without this an edge drag across the dim would still open the side menu.
  const swallow = (e: SyntheticEvent) => e.stopPropagation();

  return createPortal(
    <div
      className={'ob-spot' + (box ? '' : ' ob-spot--pending')}
      onClick={swallow}
      onPointerDown={swallow}
      onTouchStart={swallow}
      onMouseDown={swallow}
    >
      <div ref={safeRef} className="ob-safe" aria-hidden="true" />
      {box && ring && (
        <>
          <div className="ob-spot-ring" style={ring} />
          {step.gesture && <GestureHint gesture={step.gesture} box={box} />}
          <div
            ref={cardRef}
            tabIndex={-1}
            className={`ob-card ob-card--${placement}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <p className="ob-sr" aria-live="polite">
              {t('onboarding.controls.step', { n: index + 1, total })}
            </p>
            <h2 id={titleId} className="ob-card-title">
              {t(`onboarding.tours.${tourId}.${step.key}.title`)}
            </h2>
            <p className="ob-card-body">{t(`onboarding.tours.${tourId}.${step.key}.body`)}</p>
            <div className="ob-card-foot">
              <button type="button" className="ob-btn ob-btn--link" onClick={onSkip}>
                {t('onboarding.controls.skip')}
              </button>
              <Dots count={total} active={index} />
              <div className="ob-card-actions">
                {canGoBack && (
                  <button type="button" className="ob-btn ob-btn--link" onClick={onPrev}>
                    {t('onboarding.controls.previous')}
                  </button>
                )}
                <button type="button" className="b-btn b-btn--primary" onClick={onNext}>
                  {isLast ? t('onboarding.controls.done') : t('onboarding.controls.next')}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>,
    host,
  );
}
