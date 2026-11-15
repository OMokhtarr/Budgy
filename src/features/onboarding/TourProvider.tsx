/**
 * Owns everything onboarding shows: the launch deck (welcome or What's new) and one page tour at a
 * time from a queue. Pages ask for tours through usePageTour; Settings replays through useTours.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useHistory } from 'react-router-dom';
import {
  completeWelcome,
  markReleasesSeen,
  markTourSeen,
  resetTours as clearSeenTours,
  type OnboardingState,
} from './onboardingStore';
import { SpotlightOverlay } from './SpotlightOverlay';
import { RELEASES, RELEASE_FEATURE_KEYS, TOURS, type Release, type TourId, type TourStep } from './tourCatalog';
import {
  isOverlayOpen,
  launchDeck,
  nextShowable,
  pendingTours,
  pickNext,
  previousShown,
  resolveTarget,
  shouldMarkSeen,
  type Deck,
  type TourRequest,
} from './tourLogic';
import WelcomeSlides from './WelcomeSlides';
import WhatsNew from './WhatsNew';

export interface TourApi {
  requestTours: (reqs: TourRequest[]) => void;
  cancelTours: (ids: TourId[]) => void;
  /** Replays the welcome slides, without the currency pick. */
  showWelcome: () => void;
  showWhatsNew: () => void;
  resetTours: () => void;
  hasReleases: boolean;
  /** The welcome slides are up; launch-time nudges (backup toast, bank text scan) wait for them. */
  welcomeOpen: boolean;
}

const NOOP: TourApi = {
  requestTours: () => {},
  cancelTours: () => {},
  showWelcome: () => {},
  showWhatsNew: () => {},
  resetTours: () => {},
  hasReleases: false,
  welcomeOpen: false,
};

const Ctx = createContext<TourApi>(NOOP);
export const useTours = () => useContext(Ctx);

interface ActiveTour {
  req: TourRequest;
  index: number;
  /** Step indices actually displayed, for "Previous" and for marking seen. */
  shown: number[];
}

/** How long a request blocked by an open sheet waits before re-checking. */
const GATE_RETRY_MS = 400;

/** The step after `index` whose target is on screen now, or null. */
const nextStepOnScreen = (tourId: TourId, index: number) =>
  nextShowable(TOURS[tourId], index, (s: TourStep) => resolveTarget(document, `${tourId}.${s.key}`, !!s.union) !== null);

export function TourProvider({ initial, children }: { initial: OnboardingState | null; children: ReactNode }) {
  const history = useHistory();
  const [state, setState] = useState(initial);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [deck, setDeck] = useState<Deck>(() => launchDeck(initial, RELEASES));
  const [queue, setQueue] = useState<TourRequest[]>([]);
  const [active, setActive] = useState<ActiveTour | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const [retry, setRetry] = useState(0);

  const commit = useCallback((next: OnboardingState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const endTour = useCallback(
    (reason: 'done' | 'skip' | 'cancel') => {
      const a = activeRef.current;
      if (!a) return;
      const s = stateRef.current;
      if (s && shouldMarkSeen(reason, a.shown.length)) commit(markTourSeen(s, a.req.tourId));
      activeRef.current = null;
      setActive(null);
    },
    [commit],
  );

  const requestTours = useCallback((reqs: TourRequest[]) => {
    setQueue((q) => {
      const fresh = reqs.filter(
        (r) =>
          pendingTours(stateRef.current, [r.tourId]).length > 0 &&
          activeRef.current?.req.tourId !== r.tourId &&
          !q.some((x) => x.tourId === r.tourId),
      );
      return fresh.length > 0 ? [...q, ...fresh] : q;
    });
  }, []);

  const cancelTours = useCallback(
    (ids: TourId[]) => {
      setQueue((q) => q.filter((r) => !ids.includes(r.tourId)));
      if (activeRef.current && ids.includes(activeRef.current.req.tourId)) endTour('cancel');
    },
    [endTour],
  );

  // Start the next tour once nothing else is showing.
  useEffect(() => {
    if (deck || active || queue.length === 0) return;
    const i = pickNext(queue, isOverlayOpen(document));
    if (i === -1) {
      const timer = window.setTimeout(() => setRetry((n) => n + 1), GATE_RETRY_MS);
      return () => window.clearTimeout(timer);
    }
    const req = queue[i];
    setQueue((q) => q.filter((r) => r.tourId !== req.tourId));
    if (pendingTours(stateRef.current, [req.tourId]).length === 0) return;
    req.onBeforeStart?.();
    setActive({ req, index: 0, shown: [] });
  }, [deck, active, queue, retry]);

  const advance = useCallback(() => {
    const a = activeRef.current;
    if (!a) return;
    const next = nextStepOnScreen(a.req.tourId, a.index);
    if (next === null) endTour('done');
    else setActive({ ...a, index: next });
  }, [endTour]);

  const goBack = useCallback(() => {
    const a = activeRef.current;
    if (!a) return;
    const prev = previousShown(a.shown, a.index);
    if (prev !== null) setActive({ ...a, index: prev });
  }, []);

  const markShown = useCallback(() => {
    setActive((a) => (a && !a.shown.includes(a.index) ? { ...a, shown: [...a.shown, a.index] } : a));
  }, []);

  const skip = useCallback(() => endTour('skip'), [endTour]);

  const closeDeck = useCallback(() => setDeck(null), []);

  const finishWelcome = useCallback(() => {
    const s = stateRef.current;
    if (s) commit(completeWelcome(s, RELEASE_FEATURE_KEYS));
    setDeck(null);
  }, [commit]);

  const closeWhatsNew = useCallback(
    (releases: Release[], route?: string) => {
      const s = stateRef.current;
      if (s) commit(markReleasesSeen(s, releases.flatMap((r) => r.features.map((f) => f.key))));
      setDeck(null);
      if (route) history.push(route);
    },
    [commit, history],
  );

  const welcomeOpen = deck?.kind === 'welcome';
  const api = useMemo<TourApi>(
    () => ({
      requestTours,
      cancelTours,
      showWelcome: () => setDeck({ kind: 'welcome', replay: true }),
      showWhatsNew: () => {
        const latest = RELEASES[RELEASES.length - 1];
        if (latest) setDeck({ kind: 'whatsNew', releases: [latest] });
      },
      resetTours: () => {
        const s = stateRef.current;
        if (s) commit(clearSeenTours(s));
      },
      hasReleases: RELEASES.length > 0,
      welcomeOpen,
    }),
    [requestTours, cancelTours, commit, welcomeOpen],
  );

  const steps = active ? TOURS[active.req.tourId] : [];

  return (
    <Ctx.Provider value={api}>
      {children}
      {deck?.kind === 'welcome' && (
        <WelcomeSlides withCurrency={!deck.replay} onDone={deck.replay ? closeDeck : finishWelcome} />
      )}
      {deck?.kind === 'whatsNew' && (
        <WhatsNew
          releases={deck.releases}
          onDone={() => closeWhatsNew(deck.releases)}
          onShowMe={(route) => closeWhatsNew(deck.releases, route)}
        />
      )}
      {active && !deck && (
        <SpotlightOverlay
          key={`${active.req.tourId}:${active.index}`}
          tourId={active.req.tourId}
          step={steps[active.index]}
          index={active.index}
          total={steps.length}
          canGoBack={previousShown(active.shown, active.index) !== null}
          isLast={nextStepOnScreen(active.req.tourId, active.index) === null}
          onShown={markShown}
          onMissing={advance}
          onNext={advance}
          onPrev={goBack}
          onSkip={skip}
        />
      )}
    </Ctx.Provider>
  );
}
