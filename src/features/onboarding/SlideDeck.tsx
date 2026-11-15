/**
 * Full-screen slide shell shared by the welcome and "What's new" decks. It sits above everything,
 * Ionic's own overlays included. The back button acts as Skip.
 */
import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { swipeStep } from '@/core/utils/swipe';
import { Illustration } from './illustrations';
import type { IllustrationId } from './tourCatalog';
import { useBackToSkip } from './useBackToSkip';
import './onboarding.css';

export interface DeckSlide {
  key: string;
  art: IllustrationId;
  title: string;
  body: string;
  /** Shown under the body, like the language buttons or the currency chips. */
  extra?: ReactNode;
  action?: { label: string; onClick: () => void };
}

export function Dots({ count, active }: { count: number; active: number }) {
  return (
    <div className="ob-dots" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={'ob-dot' + (i === active ? ' is-on' : '')} />
      ))}
    </div>
  );
}

interface Props {
  slides: DeckSlide[];
  eyebrow?: string;
  finishLabel: string;
  onFinish: () => void;
  onSkip: () => void;
  /** Skip and back jump to this slide instead of leaving. On it, Skip is hidden and back does nothing. */
  skipTo?: number;
  finishDisabled?: boolean;
}

export function SlideDeck({ slides, eyebrow, finishLabel, onFinish, onSkip, skipTo, finishDisabled }: Props) {
  const { t, i18n } = useTranslation();
  const rtl = i18n.dir() === 'rtl';
  const [index, setIndex] = useState(0);
  const start = useRef<{ x: number; y: number; time: number } | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();

  const last = slides.length - 1;
  const current = Math.min(index, last);
  const slide = slides[current];
  const isLast = current >= last;
  const onSkipTarget = skipTo !== undefined && current === skipTo;

  const skip = () => {
    if (skipTo === undefined) onSkip();
    else if (!onSkipTarget) setIndex(skipTo);
  };
  useBackToSkip(skip);

  useEffect(() => {
    titleRef.current?.focus();
  }, [current]);

  const onPointerUp = (e: PointerEvent) => {
    if (!start.current) return;
    const { x, y, time } = start.current;
    start.current = null;
    const step = swipeStep(e.clientX - x, e.clientY - y, e.timeStamp - time, rtl);
    if (step === 1 && !isLast) setIndex(current + 1);
    if (step === -1 && current > 0) setIndex(current - 1);
  };

  if (!slide) return null;

  return createPortal(
    <div className="ob-deck" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="ob-deck-inner">
        <div className="ob-deck-top">
          {!onSkipTarget && (
            <button type="button" className="ob-btn ob-btn--link" onClick={skip}>
              {t('onboarding.controls.skip')}
            </button>
          )}
        </div>
        <div
          className="ob-deck-slide"
          key={slide.key}
          onPointerDown={(e) => {
            start.current = { x: e.clientX, y: e.clientY, time: e.timeStamp };
          }}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            start.current = null;
          }}
        >
          <div className="ob-deck-art">
            <Illustration id={slide.art} />
          </div>
          {eyebrow && <p className="ob-deck-eyebrow">{eyebrow}</p>}
          <h2 ref={titleRef} id={titleId} tabIndex={-1} className="ob-deck-title">
            {slide.title}
          </h2>
          <p className="ob-deck-body">{slide.body}</p>
          {slide.extra && <div className="ob-deck-extra">{slide.extra}</div>}
          {slide.action && (
            <button type="button" className="ob-btn ob-btn--ghost" onClick={slide.action.onClick}>
              {slide.action.label}
            </button>
          )}
        </div>
        <p className="ob-sr" aria-live="polite">
          {t('onboarding.controls.step', { n: current + 1, total: slides.length })}
        </p>
        <Dots count={slides.length} active={current} />
        <div className="ob-deck-nav">
          {current > 0 ? (
            <button type="button" className="ob-btn ob-btn--link" onClick={() => setIndex(current - 1)}>
              {t('onboarding.controls.previous')}
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="b-btn b-btn--primary ob-deck-next"
            disabled={isLast && finishDisabled}
            onClick={() => (isLast ? onFinish() : setIndex(current + 1))}
          >
            {isLast ? finishLabel : t('onboarding.controls.next')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
