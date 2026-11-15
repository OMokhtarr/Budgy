/**
 * Onboarding persistence: whether the welcome slides ran, and which page tours
 * and "What's new" releases the user has been through. One localStorage key,
 * pure functions, no React.
 */

export const ONBOARDING_KEY = 'budgy-onboarding-v1';

/**
 * Flag an older build left behind while a new user had not yet picked a
 * currency. Seeing it means the user is new; it is removed once onboarding
 * state exists.
 */
export const PICK_CURRENCY_KEY = 'budgy-pick-currency';

export interface OnboardingState {
  welcomeDone: boolean;
  seenTours: string[];
  /** Keys of the announced features already seen. */
  seenReleases: string[];
}

const stringList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

function parse(raw: string): OnboardingState | null {
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    return {
      welcomeDone: v.welcomeDone === true,
      seenTours: stringList(v.seenTours),
      seenReleases: stringList(v.seenReleases),
    };
  } catch {
    return null;
  }
}

function save(s: OnboardingState): OnboardingState {
  try {
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify(s));
  } catch {
    // Storage full or blocked: the in-memory state still drives this session.
  }
  return s;
}

/**
 * Loads the state, creating it on the first launch of an onboarding-aware
 * build. A new user (a fresh database, or an unpicked currency flag) starts the
 * welcome; anyone else is an existing user and skips it along with every
 * current release. Returns null when storage is unusable, so callers show
 * nothing rather than onboarding on every launch.
 */
export function initOnboarding(opts: { fresh: boolean; releaseKeys: string[] }): OnboardingState | null {
  try {
    const raw = localStorage.getItem(ONBOARDING_KEY);
    if (raw !== null) {
      // Corrupt state is treated as an existing user: never re-run the welcome.
      return parse(raw) ?? save({ welcomeDone: true, seenTours: [], seenReleases: [...opts.releaseKeys] });
    }
    const isNew = opts.fresh || localStorage.getItem(PICK_CURRENCY_KEY) === '1';
    const state: OnboardingState = isNew
      ? { welcomeDone: false, seenTours: [], seenReleases: [] }
      : { welcomeDone: true, seenTours: [], seenReleases: [...opts.releaseKeys] };
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify(state));
    localStorage.removeItem(PICK_CURRENCY_KEY);
    return state;
  } catch {
    return null;
  }
}

const withItems = (list: string[], items: string[]) => [...list, ...items.filter((i) => !list.includes(i))];

export const markTourSeen = (s: OnboardingState, id: string) =>
  save({ ...s, seenTours: withItems(s.seenTours, [id]) });

export const markReleasesSeen = (s: OnboardingState, keys: string[]) =>
  save({ ...s, seenReleases: withItems(s.seenReleases, keys) });

export const completeWelcome = (s: OnboardingState, releaseKeys: string[]) =>
  save({ ...s, welcomeDone: true, seenReleases: withItems(s.seenReleases, releaseKeys) });

export const resetTours = (s: OnboardingState) => save({ ...s, seenTours: [] });
