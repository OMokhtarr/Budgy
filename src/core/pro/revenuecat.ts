import { Capacitor } from '@capacitor/core';
import { Purchases } from '@revenuecat/purchases-capacitor';
import type { CustomerInfo } from '@revenuecat/purchases-capacitor';
import { PAYWALL_RESULT, RevenueCatUI } from '@revenuecat/purchases-capacitor-ui';
import { revenueCatKey } from './gate';

/**
 * Thin wrapper over the RevenueCat Capacitor SDK for Budgy Pro. RevenueCat verifies store receipts on its own
 * servers, so it is the source of truth for "is this person Pro?"; the app only caches its answer. Buying happens
 * on RevenueCat's Paywall and managing a subscription in its Customer Center, both designed in the dashboard.
 * Only call these on native platforms: store billing doesn't exist on web.
 */

export type { CustomerInfo };

/** Must match the entitlement id in the RevenueCat dashboard. */
export const PRO_ENTITLEMENT = 'budgy_pro';

/** Test Store keys start with this. The SDK deliberately crashes a release build configured with one. */
const TEST_STORE_KEY_PREFIX = 'test_';

let configured: Promise<void> | null = null;

/**
 * Configures the SDK once, with the platform's public key. A build without a key never starts RevenueCat, so it
 * sends nothing to it. A Test Store key is refused outside debug builds instead of crashing at launch. The first
 * call wins: `appUserId`, when given, is the identity the SDK starts with.
 */
export function configureRevenueCat(appUserId?: string | null): Promise<void> {
  if (!configured) {
    const apiKey = revenueCatKey();
    if (!apiKey) {
      configured = Promise.reject(new Error('RevenueCat is not configured for this build'));
    } else if (apiKey.startsWith(TEST_STORE_KEY_PREFIX) && !Capacitor.DEBUG) {
      configured = Promise.reject(
        new Error('A RevenueCat Test Store key only works in debug builds, use the store key for release'),
      );
    } else {
      configured = Purchases.configure(appUserId ? { apiKey, appUserID: appUserId } : { apiKey });
    }
  }
  return configured;
}

/** Forgets the memoised configure call so a test can configure afresh. */
export function resetRevenueCatForTests(): void {
  configured = null;
}

/** RevenueCat's screens follow the phone's language unless told otherwise; the app has its own setting. */
export async function setRevenueCatLocale(lang: 'ar' | 'en'): Promise<void> {
  await configureRevenueCat();
  await Purchases.overridePreferredUILocale({ locale: lang });
}

export async function fetchCustomerInfo(): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.getCustomerInfo();
  return customerInfo;
}

/**
 * Moves RevenueCat to the signed-in account. When that account has no Pro, a purchase made anonymously on this
 * device may not be attached to it yet, so sync once and re-read before giving up.
 */
export async function logInAndCheck(id: string): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.logIn({ appUserID: id });
  if (isProFromCustomerInfo(customerInfo)) return customerInfo;
  try {
    await Purchases.syncPurchases();
    return await fetchCustomerInfo();
  } catch (err) {
    // The logIn itself succeeded, so keep its answer; the listener reports a late sync.
    console.warn('Budgy: syncing purchases after logIn failed', err);
    return customerInfo;
  }
}

/** Back to an anonymous id. logOut throws for an already anonymous user, so that case just resolves the info. */
export async function logOutRevenueCat(): Promise<CustomerInfo> {
  const { isAnonymous } = await Purchases.isAnonymous();
  if (isAnonymous) return fetchCustomerInfo();
  const { customerInfo } = await Purchases.logOut();
  return customerInfo;
}

/** Calls `cb` on every renewal, expiry or purchase. Resolves to an unsubscribe function. */
export async function onCustomerInfo(cb: (info: CustomerInfo) => void): Promise<() => void> {
  const id = await Purchases.addCustomerInfoUpdateListener(cb);
  return () => {
    void Purchases.removeCustomerInfoUpdateListener({ listenerToRemove: id }).catch(() => {});
  };
}

export async function restore(): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.restorePurchases();
  return customerInfo;
}

export async function fetchAppUserId(): Promise<string> {
  const { appUserID } = await Purchases.getAppUserID();
  return appUserID;
}

export function isProFromCustomerInfo(info: CustomerInfo): boolean {
  return info.entitlements.active[PRO_ENTITLEMENT] !== undefined;
}

/** What the active Pro entitlement looks like, for the account card. */
export interface ProPlan {
  /** 'lifetime' when it never expires (a promotional grant, say). */
  period: 'monthly' | 'yearly' | 'lifetime' | 'other';
  trial: boolean;
  willRenew: boolean;
  /** ISO date it renews or ends; null for lifetime. */
  endsAt: string | null;
  billingIssue: boolean;
}

/** Null when Pro isn't active. Play reports the base plan in productPlanIdentifier and the Test Store only the product id, so both are matched. */
export function proPlanFromCustomerInfo(info: CustomerInfo): ProPlan | null {
  const ent = info.entitlements.active[PRO_ENTITLEMENT];
  if (!ent) return null;
  const plan = (ent.productPlanIdentifier ?? ent.productIdentifier ?? '').toLowerCase();
  // A promotional grant isn't a purchased plan, so it gets no plan name; lifetime ones may carry a far-off expiry.
  let period: ProPlan['period'];
  if (!ent.expirationDate || plan.includes('lifetime')) period = 'lifetime';
  else if (ent.store === 'PROMOTIONAL') period = 'other';
  else if (plan.includes('month')) period = 'monthly';
  else if (plan.includes('year') || plan.includes('annual')) period = 'yearly';
  else period = 'other';
  return {
    period,
    trial: ent.periodType === 'TRIAL',
    willRenew: ent.willRenew,
    endsAt: ent.expirationDate ?? null,
    billingIssue: !!ent.billingIssueDetectedAt,
  };
}

export type PaywallResult = 'purchased' | 'restored' | 'cancelled' | 'error';

/** Shows the current offering's paywall and resolves once it is dismissed. */
export async function presentPaywall(): Promise<PaywallResult> {
  const { result } = await RevenueCatUI.presentPaywall();
  switch (result) {
    case PAYWALL_RESULT.PURCHASED:
      return 'purchased';
    case PAYWALL_RESULT.RESTORED:
      return 'restored';
    case PAYWALL_RESULT.ERROR:
      return 'error';
    default:
      return 'cancelled';
  }
}

/** Shows the Customer Center (cancel, change plan, restore, refunds) and resolves once it is dismissed. */
export async function presentCustomerCenter(): Promise<void> {
  await RevenueCatUI.presentCustomerCenter();
}
