import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ platform: 'android' as 'android' | 'ios' | 'web', debug: false }));
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => mocks.platform !== 'web',
    getPlatform: () => mocks.platform,
    get DEBUG() {
      return mocks.debug;
    },
  },
}));

const { isProGateOn, proAvailable, proMode, revenueCatKey } = await import('./gate');

function env(gate: string | undefined, android: string, ios: string) {
  vi.stubEnv('VITE_PRO_GATE', gate ?? '');
  vi.stubEnv('VITE_REVENUECAT_ANDROID_KEY', android);
  vi.stubEnv('VITE_REVENUECAT_IOS_KEY', ios);
}

afterEach(() => {
  vi.unstubAllEnvs();
  mocks.platform = 'android';
  mocks.debug = false;
});

describe('proMode', () => {
  it('is off when VITE_PRO_GATE is unset even with a key', () => {
    env(undefined, 'goog_x', '');
    expect(proMode()).toBe('off');
  });

  it('is test with a key on android', () => {
    env('test', 'goog_x', '');
    expect(proMode()).toBe('test');
    expect(proAvailable()).toBe(true);
    expect(isProGateOn()).toBe(false);
  });

  it('is on with a key on android', () => {
    env('on', 'goog_x', '');
    expect(proMode()).toBe('on');
    expect(proAvailable()).toBe(true);
    expect(isProGateOn()).toBe(true);
  });

  it('is off on web', () => {
    mocks.platform = 'web';
    env('on', 'goog_x', 'appl_x');
    expect(proMode()).toBe('off');
    expect(proAvailable()).toBe(false);
  });

  it('is off without the platform key', () => {
    env('on', '', 'appl_x');
    expect(proMode()).toBe('off');
  });

  it('is off for an unknown VITE_PRO_GATE value', () => {
    env('yes', 'goog_x', '');
    expect(proMode()).toBe('off');
  });

  it('is off for a Test Store key in a release build', () => {
    env('on', 'test_x', '');
    expect(proMode()).toBe('off');
    expect(proAvailable()).toBe(false);
  });

  it('is on for a Test Store key in a debug build', () => {
    mocks.debug = true;
    env('on', 'test_x', '');
    expect(proMode()).toBe('on');
  });
});

describe('revenueCatKey', () => {
  it('uses the iOS key on ios', () => {
    mocks.platform = 'ios';
    env('on', 'goog_x', 'appl_x');
    expect(revenueCatKey()).toBe('appl_x');
  });

  it('uses the Android key elsewhere, and is empty when unset', () => {
    env('on', 'goog_x', 'appl_x');
    expect(revenueCatKey()).toBe('goog_x');
    env('on', '', 'appl_x');
    expect(revenueCatKey()).toBe('');
  });
});
