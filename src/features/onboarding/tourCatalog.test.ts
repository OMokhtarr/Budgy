import { describe, expect, it, vi } from 'vitest';
import en from '@/core/i18n/locales/en.json';
import ar from '@/core/i18n/locales/ar.json';
import {
  ALL_RELEASES,
  TOURS,
  WELCOME_SLIDES,
  releasesForPlatform,
  tourAttr,
  type Release,
} from './tourCatalog';

vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'web' } }));

type Tree = { [key: string]: unknown };

const get = (obj: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Tree)[k] : undefined), obj);

const both = (path: string) => {
  for (const [name, lang] of [['en', en], ['ar', ar]] as const) {
    expect(get(lang, path), `${name}: ${path}`).toBeTruthy();
  }
};

/**
 * Problems with a release list: repeated keys, unknown tours, missing copy.
 * `copy` is the pair of languages to look in, so a test can supply its own.
 */
function releaseProblems(releases: Release[], langs: unknown[] = [en, ar]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const f of releases.flatMap((r) => r.features)) {
    if (seen.has(f.key)) problems.push(`duplicate key ${f.key}`);
    seen.add(f.key);
    if (!(f.tourId in TOURS)) problems.push(`unknown tour ${f.tourId}`);
    for (const field of ['title', 'body']) {
      for (const lang of langs) {
        if (!get(lang, `onboarding.releases.${f.key}.${field}`)) problems.push(`no copy ${f.key}.${field}`);
      }
    }
  }
  return problems;
}

describe('tour copy', () => {
  it('every tour step has an English and Arabic title and body', () => {
    for (const [id, steps] of Object.entries(TOURS)) {
      for (const s of steps) for (const f of ['title', 'body']) both(`onboarding.tours.${id}.${s.key}.${f}`);
    }
  });
  it('every welcome slide and control has both languages', () => {
    for (const s of WELCOME_SLIDES) for (const f of ['title', 'body']) both(`onboarding.slides.${s.id}.${f}`);
    for (const k of ['skip', 'next', 'previous', 'done', 'getStarted', 'showMe', 'step', 'chooseLanguage', 'english', 'arabic', 'whatsNew']) {
      both(`onboarding.controls.${k}`);
    }
    for (const k of ['title', 'welcome', 'replay', 'replayToast', 'whatsNew']) both(`onboarding.settings.${k}`);
  });
});

describe('releases', () => {
  it('release features have unique keys, a known tour and copy', () => {
    expect(releaseProblems(ALL_RELEASES)).toEqual([]);
  });
  it('the check accepts a valid release and rejects a duplicate key or unknown tour', () => {
    const f = { key: 'x', art: 'brand' as const, route: '/sms', tourId: 'sms' as const };
    const copy = { onboarding: { releases: { x: { title: 't', body: 'b' } } } };
    expect(releaseProblems([{ features: [f] }], [copy])).toEqual([]);
    expect(releaseProblems([{ features: [f] }, { features: [f] }], [copy])).toContain('duplicate key x');
    expect(releaseProblems([{ features: [{ ...f, tourId: 'nope' as never }] }], [copy])).toContain('unknown tour nope');
    expect(releaseProblems([{ features: [f] }], [{}])).toContain('no copy x.title');
  });
  it('releasesForPlatform drops other platforms and empty releases', () => {
    const r = [{ features: [{ key: 'x', art: 'brand', route: '/sms', tourId: 'sms', platforms: ['android'] }] }] as Release[];
    expect(releasesForPlatform(r, 'web')).toEqual([]);
    expect(releasesForPlatform(r, 'android')[0].features).toHaveLength(1);
  });
});

describe('tourAttr', () => {
  it('joins several refs with a space', () =>
    expect(tourAttr('categories.menu', 'accounts.tabs')).toEqual({ 'data-tour': 'categories.menu accounts.tabs' }));
});
