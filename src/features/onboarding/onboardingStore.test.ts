import '@/test/setup-db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  completeWelcome,
  initOnboarding,
  markReleasesSeen,
  markTourSeen,
  resetTours,
} from './onboardingStore';

describe('onboarding store', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a fresh database starts the welcome', () => {
    expect(initOnboarding({ fresh: true, releaseKeys: ['a'] })).toEqual({
      welcomeDone: false,
      seenTours: [],
      seenReleases: [],
    });
  });

  it('an unpicked currency from an older build also counts as new, and the flag is removed', () => {
    localStorage.setItem('budgy-pick-currency', '1');
    expect(initOnboarding({ fresh: false, releaseKeys: [] })?.welcomeDone).toBe(false);
    expect(localStorage.getItem('budgy-pick-currency')).toBeNull();
  });

  it('an existing user skips the welcome and every current release', () => {
    expect(initOnboarding({ fresh: false, releaseKeys: ['a', 'b'] })).toEqual({
      welcomeDone: true,
      seenTours: [],
      seenReleases: ['a', 'b'],
    });
  });

  it('stored state wins over fresh', () => {
    localStorage.setItem(
      'budgy-onboarding-v1',
      JSON.stringify({ welcomeDone: true, seenTours: ['x'], seenReleases: [] }),
    );
    expect(initOnboarding({ fresh: true, releaseKeys: [] })?.seenTours).toEqual(['x']);
  });

  it('corrupt state counts as an existing user', () => {
    localStorage.setItem('budgy-onboarding-v1', '{nope');
    expect(initOnboarding({ fresh: true, releaseKeys: ['a'] })).toEqual({
      welcomeDone: true,
      seenTours: [],
      seenReleases: ['a'],
    });
  });

  it('blocked storage returns null', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(initOnboarding({ fresh: true, releaseKeys: [] })).toBeNull();
  });

  it('marking is idempotent and persisted', () => {
    const s = initOnboarding({ fresh: true, releaseKeys: [] })!;
    const t = markTourSeen(markTourSeen(s, 'categories'), 'categories');
    expect(t.seenTours).toEqual(['categories']);
    expect(JSON.parse(localStorage.getItem('budgy-onboarding-v1')!).seenTours).toEqual(['categories']);
  });

  it('markReleasesSeen adds each release once', () => {
    const s = initOnboarding({ fresh: true, releaseKeys: [] })!;
    expect(markReleasesSeen(markReleasesSeen(s, ['a', 'b']), ['b', 'c']).seenReleases).toEqual(['a', 'b', 'c']);
  });

  it('completeWelcome marks the welcome done and the releases seen; resetTours clears tours only', () => {
    const s = markTourSeen(initOnboarding({ fresh: true, releaseKeys: [] })!, 'categories');
    const done = completeWelcome(s, ['a']);
    expect(done).toEqual({ welcomeDone: true, seenTours: ['categories'], seenReleases: ['a'] });
    expect(resetTours(done)).toEqual({ welcomeDone: true, seenTours: [], seenReleases: ['a'] });
    expect(JSON.parse(localStorage.getItem('budgy-onboarding-v1')!).seenTours).toEqual([]);
  });
});
