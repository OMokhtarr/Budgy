/**
 * What the onboarding shows: the welcome slides, every page tour's steps, and
 * the "What's new" releases. Content only. The words live in the locale files
 * under `onboarding` and the rules in tourLogic.ts.
 *
 * A step's target is the element carrying `data-tour="<tourId>.<key>"`
 * (spread `tourAttr(...)` onto it). A step whose target is not on screen is
 * skipped, so steps for conditional UI are safe.
 *
 * Shipping a feature later:
 *  1. Add a tour with a NEW id here (+ copy, + data-tour targets, + the page's
 *     tour list).
 *  2. Add a Release whose feature (with a NEW key) points at that route and
 *     tour id, with its copy under `onboarding.releases.<key>`.
 */
import { Capacitor } from '@capacitor/core';

export type Gesture = 'swipe' | 'longPress' | 'tap' | 'drag';

export interface TourStep {
  key: string;
  gesture?: Gesture;
  /** Ring every matching element together instead of only the first. */
  union?: boolean;
}

export type TourId = 'categories' | 'accounts' | 'transactions' | 'overview' | 'editor' | 'settings' | 'sms';

export const TOURS: Record<TourId, TourStep[]> = {
  categories: [
    { key: 'bubble' },
    { key: 'center' },
    { key: 'period', gesture: 'swipe' },
    { key: 'balance' },
    { key: 'edit', gesture: 'drag' },
    { key: 'menu' },
  ],
  accounts: [{ key: 'tabs', gesture: 'swipe' }, { key: 'transfer' }, { key: 'add' }, { key: 'row' }],
  transactions: [{ key: 'add' }, { key: 'row', gesture: 'longPress' }, { key: 'search' }],
  overview: [{ key: 'tiles' }, { key: 'trend' }, { key: 'budgets' }],
  editor: [{ key: 'fromto' }, { key: 'keypad' }, { key: 'date' }, { key: 'note' }],
  settings: [{ key: 'currency' }, { key: 'tours' }],
  sms: [{ key: 'scan' }, { key: 'card', gesture: 'longPress' }],
};

export type TourRef = `${TourId}.${string}`;

/** Spread onto a DOM element to make it the target of one or more steps. */
export function tourAttr(...refs: TourRef[]): { 'data-tour': string } {
  return { 'data-tour': refs.join(' ') };
}

export type IllustrationId = 'brand' | 'log' | 'wallet' | 'chart' | 'cloud' | 'coins';

export type WelcomeSlideId = 'welcome' | 'log' | 'money' | 'insight' | 'private' | 'currency';

export const WELCOME_SLIDES: { id: WelcomeSlideId; art: IllustrationId }[] = [
  { id: 'welcome', art: 'brand' },
  { id: 'log', art: 'log' },
  { id: 'money', art: 'wallet' },
  { id: 'insight', art: 'chart' },
  { id: 'private', art: 'cloud' },
  { id: 'currency', art: 'coins' },
];

export interface ReleaseFeature {
  /**
   * The feature's identity, unique across every release and never reused:
   * "seen" remembers it, and its copy lives at `onboarding.releases.<key>`.
   */
  key: string;
  art: IllustrationId;
  /** Where "Show me" navigates. */
  route: string;
  /** Played on arrival; must be in that page's tour list. */
  tourId: TourId;
  /** Where the feature exists, as Capacitor names platforms; everywhere when absent. */
  platforms?: string[];
}

/**
 * One app update's announcements. It carries no version number: seen state is
 * kept per feature, so bumping the app version can never re-announce an old
 * feature.
 */
export interface Release {
  features: ReleaseFeature[];
}

/** Oldest first. Everything shipped so far is covered by the welcome slides. */
export const ALL_RELEASES: Release[] = [];

/**
 * The releases worth announcing on [platform]: features that do not exist
 * there are dropped, and so is a release left with nothing to show.
 */
export function releasesForPlatform(releases: Release[], platform: string): Release[] {
  return releases
    .map((r) => ({
      ...r,
      features: r.features.filter((f) => !f.platforms || f.platforms.includes(platform)),
    }))
    .filter((r) => r.features.length > 0);
}

export const RELEASES: Release[] = releasesForPlatform(ALL_RELEASES, Capacitor.getPlatform());

/** Every announced feature's key; a new user starts with all of them seen. */
export const RELEASE_FEATURE_KEYS = RELEASES.flatMap((r) => r.features.map((f) => f.key));
