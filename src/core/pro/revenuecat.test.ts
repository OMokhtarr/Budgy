import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, DEBUG: false },
  purchases: {
    configure: vi.fn(),
    logIn: vi.fn(),
    logOut: vi.fn(),
    isAnonymous: vi.fn(),
    getCustomerInfo: vi.fn(),
    syncPurchases: vi.fn(),
  },
  presentPaywall: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({ Capacitor: mocks.capacitor }));
vi.mock('@revenuecat/purchases-capacitor', () => ({ Purchases: mocks.purchases }));
vi.mock('@revenuecat/purchases-capacitor-ui', () => ({
  RevenueCatUI: { presentPaywall: mocks.presentPaywall },
  PAYWALL_RESULT: {
    NOT_PRESENTED: 'NOT_PRESENTED',
    ERROR: 'ERROR',
    CANCELLED: 'CANCELLED',
    PURCHASED: 'PURCHASED',
    RESTORED: 'RESTORED',
  },
}));

const mod = await import('./revenuecat');

const withActive = (active: object) => ({ entitlements: { active } }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  mod.resetRevenueCatForTests();
  mocks.capacitor.DEBUG = false;
  mocks.purchases.configure.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe('configureRevenueCat', () => {
  it('sends nothing to RevenueCat when the build has no key', async () => {
    vi.stubEnv('VITE_REVENUECAT_ANDROID_KEY', '');
    await expect(mod.configureRevenueCat()).rejects.toThrow('RevenueCat is not configured');
    expect(mocks.purchases.configure).not.toHaveBeenCalled();
  });

  it('configures once with the platform key', async () => {
    vi.stubEnv('VITE_REVENUECAT_ANDROID_KEY', 'goog_public_key');
    await mod.configureRevenueCat();
    await mod.configureRevenueCat();
    expect(mocks.purchases.configure).toHaveBeenCalledTimes(1);
    expect(mocks.purchases.configure).toHaveBeenCalledWith({ apiKey: 'goog_public_key' });
  });

  it('refuses a Test Store key in a release build', async () => {
    vi.stubEnv('VITE_REVENUECAT_ANDROID_KEY', 'test_store_key');
    await expect(mod.configureRevenueCat()).rejects.toThrow('Test Store key only works in debug builds');
    expect(mocks.purchases.configure).not.toHaveBeenCalled();
  });

  it('uses a Test Store key in a debug build', async () => {
    vi.stubEnv('VITE_REVENUECAT_ANDROID_KEY', 'test_store_key');
    mocks.capacitor.DEBUG = true;
    await mod.configureRevenueCat();
    expect(mocks.purchases.configure).toHaveBeenCalledWith({ apiKey: 'test_store_key' });
  });
});

it('reads Pro from the budgy_pro entitlement only', () => {
  expect(mod.isProFromCustomerInfo(withActive({ budgy_pro: {} }))).toBe(true);
  expect(mod.isProFromCustomerInfo(withActive({ pro: {} }))).toBe(false);
});

it('counts an expired budgy_pro entitlement as having had Pro', () => {
  const withAll = (all: object) => ({ entitlements: { active: {}, all } }) as never;
  expect(mod.hadProFromCustomerInfo(withAll({ budgy_pro: { isActive: false } }))).toBe(true);
  expect(mod.hadProFromCustomerInfo(withAll({}))).toBe(false);
});

describe('proPlanFromCustomerInfo', () => {
  const ent = (over: object) =>
    withActive({
      budgy_pro: {
        productIdentifier: 'budgy_pro:yearly',
        productPlanIdentifier: 'yearly',
        expirationDate: '2026-12-12T10:00:00Z',
        willRenew: true,
        periodType: 'NORMAL',
        billingIssueDetectedAt: null,
        ...over,
      },
    });

  it('is null without the entitlement', () => {
    expect(mod.proPlanFromCustomerInfo(withActive({}))).toBeNull();
  });

  it('reads yearly from the plan identifier', () => {
    expect(mod.proPlanFromCustomerInfo(ent({}))).toEqual({
      period: 'yearly',
      trial: false,
      willRenew: true,
      endsAt: '2026-12-12T10:00:00Z',
      billingIssue: false,
    });
  });

  it('reads monthly from the plan identifier', () => {
    expect(mod.proPlanFromCustomerInfo(ent({ productPlanIdentifier: 'monthly' }))?.period).toBe('monthly');
  });

  it('is lifetime when there is no expiry', () => {
    expect(mod.proPlanFromCustomerInfo(ent({ expirationDate: null }))?.period).toBe('lifetime');
  });

  it('reports a trial', () => {
    expect(mod.proPlanFromCustomerInfo(ent({ periodType: 'TRIAL' }))?.trial).toBe(true);
  });

  it('gives a timed promotional grant the other period', () => {
    const plan = mod.proPlanFromCustomerInfo(
      ent({ store: 'PROMOTIONAL', productIdentifier: 'rc_promo_budgy_pro_monthly', productPlanIdentifier: null }),
    );
    expect(plan?.period).toBe('other');
  });

  it('flags a billing issue', () => {
    const plan = mod.proPlanFromCustomerInfo(ent({ billingIssueDetectedAt: '2026-11-01T00:00:00Z' }));
    expect(plan?.billingIssue).toBe(true);
  });
});

it.each([
  ['PURCHASED', 'purchased'],
  ['RESTORED', 'restored'],
  ['ERROR', 'error'],
  ['CANCELLED', 'cancelled'],
  ['NOT_PRESENTED', 'cancelled'],
])('presentPaywall maps %s to %s', async (native, expected) => {
  mocks.presentPaywall.mockResolvedValue({ result: native });
  await expect(mod.presentPaywall()).resolves.toBe(expected);
});

describe('logInAndCheck', () => {
  const pro = withActive({ budgy_pro: {} });
  const free = withActive({});

  it("returns logIn's info without syncing when it has Pro", async () => {
    mocks.purchases.logIn.mockResolvedValue({ customerInfo: pro, created: false });
    await expect(mod.logInAndCheck('u1')).resolves.toBe(pro);
    expect(mocks.purchases.logIn).toHaveBeenCalledWith({ appUserID: 'u1' });
    expect(mocks.purchases.syncPurchases).not.toHaveBeenCalled();
  });

  it('syncs purchases when logIn finds no Pro', async () => {
    mocks.purchases.logIn.mockResolvedValue({ customerInfo: free, created: false });
    mocks.purchases.syncPurchases.mockResolvedValue(undefined);
    mocks.purchases.getCustomerInfo.mockResolvedValue({ customerInfo: pro });
    await expect(mod.logInAndCheck('u1')).resolves.toBe(pro);
    expect(mocks.purchases.syncPurchases).toHaveBeenCalledTimes(1);
  });

  it("falls back to logIn's info when syncing fails", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.purchases.logIn.mockResolvedValue({ customerInfo: free, created: false });
    mocks.purchases.syncPurchases.mockRejectedValue(new Error('offline'));
    await expect(mod.logInAndCheck('u1')).resolves.toBe(free);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

it('logOutRevenueCat does not call logOut when already anonymous', async () => {
  mocks.purchases.isAnonymous.mockResolvedValue({ isAnonymous: true });
  mocks.purchases.getCustomerInfo.mockResolvedValue({ customerInfo: { id: 'current' } });
  await expect(mod.logOutRevenueCat()).resolves.toEqual({ id: 'current' });
  expect(mocks.purchases.logOut).not.toHaveBeenCalled();
});
