import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { useSessionUser } from '@/core/cloud/useSessionUser';
import { isProGateOn, proAvailable } from './gate';
import { readProCache, writeProCache } from './cache';
import type { PaywallOutcome } from './rules';
import {
  configureRevenueCat,
  fetchAppUserId,
  fetchCustomerInfo,
  hadProFromCustomerInfo,
  isProFromCustomerInfo,
  logInAndCheck,
  logOutRevenueCat,
  onCustomerInfo,
  presentCustomerCenter,
  presentPaywall,
  proPlanFromCustomerInfo,
  restore as restorePurchases,
  setRevenueCatLocale,
  syncPurchasesAndCheck,
  type CustomerInfo,
  type PaywallResult,
  type ProPlan,
} from './revenuecat';

/**
 * Budgy Pro for the whole app: whether this person has it, the RevenueCat Paywall and Customer Center, and restore.
 * RevenueCat's identity follows the signed-in account (logIn/logOut), so Pro belongs to the account; signed out it
 * stays on RevenueCat's anonymous id. The last answer is cached per account and used as the starting value, so a
 * subscriber never sees a PRO badge flash while RevenueCat answers (or while offline). Renewals and expiries arrive
 * through RevenueCat's listener. When Pro isn't available in this build (see `gate.ts`), nothing starts and every
 * check passes.
 */

export interface ProValue {
  /** The real gate; false → every Pro check passes (see `proAllows`). */
  gateOn: boolean;
  /** RevenueCat runs in this build (gate 'test' or 'on'). */
  available: boolean;
  /** RevenueCat's answer (the cached one until it arrives), even at 'test'; always true when Pro isn't available. */
  isPro: boolean;
  /** RevenueCat has answered for the current account (a cached Pro answer stands in for it). */
  ready: boolean;
  /** The active plan's details; null when not Pro or not known yet. */
  plan: ProPlan | null;
  /** RevenueCat reported Pro on this account at some point, expired included (false until it answers). */
  hadPro: boolean;
  /** The account `isPro` and `ready` are about (null = signed out); for one render it can lag another session reader. */
  accountId: string | null;
  appUserId: string | null;
  /** Shows RevenueCat's Paywall; resolves once it is closed. */
  showPaywall(): Promise<PaywallOutcome>;
  /** Shows RevenueCat's Customer Center; throws when it can't be shown. */
  showCustomerCenter(): Promise<void>;
  /** Resolves to whether the restore found an active Pro subscription. */
  restore(): Promise<boolean>;
  /** Asks RevenueCat again now (e.g. a "Try again" after it couldn't be reached). */
  recheck(): void;
}

const ProContext = createContext<ProValue | null>(null);

/** Longest a purchase or restore waits for RevenueCat to move onto the account. */
const IDENTITY_WAIT_MS = 8000;

export function ProProvider({ children }: { children: React.ReactNode }) {
  const available = proAvailable();
  const gateOn = isProGateOn();
  // RevenueCat is configured once the stored session has been read, so the first identity is right.
  const session = useSessionUser();
  const sessionReady = session.ready;
  const accountId = session.user?.id ?? null;
  const accountIdRef = useRef(accountId);
  accountIdRef.current = accountId;

  const [isPro, setIsPro] = useState(() => !available || readProCache(accountId));
  const [ready, setReady] = useState(() => !available || readProCache(accountId));
  const [plan, setPlan] = useState<ProPlan | null>(null);
  const [hadPro, setHadPro] = useState(false);
  const [appUserId, setAppUserId] = useState<string | null>(null);

  // The account RevenueCat follows (undefined until configured).
  const identityRef = useRef<string | null | undefined>(undefined);
  // Identity switches run one at a time: RevenueCat's logIn/logOut overlap badly (isAnonymous lags a pending
  // logIn, and two can finish out of order). Each step reads the latest account when it runs; only the last queued
  // step applies its result, and the customer-info listener is muted meanwhile.
  const identityChain = useRef<Promise<void>>(Promise.resolve());
  const identityPending = useRef(0);
  // The account RevenueCat is on right now (null = anonymous).
  const sdkAccountId = useRef<string | null>(null);
  // The account whose purchase sync after logIn failed (offline at sign-in, say). Until it goes through, a purchase
  // made anonymously just before signing in may still sit on the anonymous id, so each recheck tries it again.
  const purchaseSyncOwed = useRef<string | null>(null);

  // In the very render where the account changes, start over from that account's cached answer (in practice
  // not Pro once RevenueCat has answered for another one), so no frame shows one account's Pro to the next.
  const [seenAccountId, setSeenAccountId] = useState(accountId);
  if (seenAccountId !== accountId) {
    setSeenAccountId(accountId);
    if (available) {
      const cached = readProCache(accountId);
      setIsPro(cached);
      setReady(cached);
      setPlan(null);
      setHadPro(false);
      setAppUserId(null);
    }
  }

  /** Shows and caches `info`, unless the account it belongs to (`owner`) has signed out since it was asked for. */
  const apply = useCallback((info: CustomerInfo, owner: string | null) => {
    const pro = isProFromCustomerInfo(info);
    if (owner !== accountIdRef.current) return pro;
    setIsPro(pro);
    setPlan(proPlanFromCustomerInfo(info));
    setHadPro(hadProFromCustomerInfo(info));
    setReady(true);
    writeProCache(owner, pro);
    return pro;
  }, []);

  /** Queues a move of RevenueCat onto whichever account is current when it runs. */
  const syncIdentity = useCallback(() => {
    identityPending.current += 1;
    identityChain.current = identityChain.current
      .then(async () => {
        const target = accountIdRef.current;
        let info: CustomerInfo;
        if (!target) {
          // No-op when RevenueCat is already anonymous.
          purchaseSyncOwed.current = null;
          info = await logOutRevenueCat();
        } else if (sdkAccountId.current === target && purchaseSyncOwed.current === target) {
          try {
            info = await syncPurchasesAndCheck();
            purchaseSyncOwed.current = null;
          } catch (err) {
            console.warn('Budgy: syncing purchases failed again', err);
            info = await fetchCustomerInfo();
          }
        } else if (sdkAccountId.current === target) {
          info = await fetchCustomerInfo();
        } else {
          const result = await logInAndCheck(target);
          info = result.info;
          purchaseSyncOwed.current = result.syncFailed ? target : null;
        }
        sdkAccountId.current = target;
        const id = target ?? (await fetchAppUserId());
        if (identityPending.current === 1 && target === accountIdRef.current) {
          apply(info, target);
          setAppUserId(id);
        }
      })
      .catch((err) => console.warn('Budgy: moving RevenueCat to the account failed', err))
      .then(() => {
        identityPending.current -= 1;
      });
  }, [apply]);

  useEffect(() => {
    if (!available || !sessionReady) return;
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    let removeResume: (() => void) | null = null;
    // Back in front and back online, ask again: this reads renewals and expiries, and finishes a move to the
    // signed-in account that failed earlier (offline at sign-in, say), which nothing else would retry.
    const recheck = () => {
      if (!cancelled && identityPending.current === 0) syncIdentity();
    };

    identityRef.current = accountIdRef.current;
    sdkAccountId.current = accountIdRef.current;
    configureRevenueCat(accountIdRef.current)
      .then(() => {
        if (cancelled) return;
        // Also puts an SDK still on a previous account back to anonymous when signed out.
        syncIdentity();
        window.addEventListener('online', recheck);
        if (Capacitor.isNativePlatform()) {
          CapApp.addListener('resume', recheck)
            .then((handle) => {
              if (cancelled) void handle.remove();
              else removeResume = () => void handle.remove();
            })
            .catch((err) => console.warn('Budgy: resume listener failed', err));
        }
        onCustomerInfo((info) => {
          if (!cancelled && identityPending.current === 0) apply(info, sdkAccountId.current);
        })
          .then((unsub) => {
            if (cancelled) unsub();
            else unsubscribe = unsub;
          })
          .catch((err) => console.warn('Budgy: RevenueCat listener failed', err));
      })
      .catch((err) => console.warn('Budgy: RevenueCat configure failed', err));

    return () => {
      cancelled = true;
      unsubscribe?.();
      removeResume?.();
      window.removeEventListener('online', recheck);
    };
  }, [available, sessionReady, apply, syncIdentity]);

  // A later sign-in or sign-out moves RevenueCat to the new account (isPro was already reset during render, above).
  useEffect(() => {
    if (!available || !sessionReady) return;
    if (identityRef.current === undefined || identityRef.current === accountId) return;
    identityRef.current = accountId;
    syncIdentity();
  }, [available, sessionReady, accountId, syncIdentity]);

  // The Paywall and Customer Center speak the app's language, not the phone's, and follow it when it's switched.
  const { i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  useEffect(() => {
    if (!available || !sessionReady) return;
    configureRevenueCat(accountIdRef.current)
      .then(() => setRevenueCatLocale(lang).catch((err) => console.warn('Budgy: paywall language failed', err)))
      // A failed configure is already reported by the effect above.
      .catch(() => {});
  }, [available, sessionReady, lang]);

  /**
   * Resolves true once RevenueCat is on the account that is signed in right now. When nothing is pending but the
   * SDK is on another account (a sign-in whose switch hasn't been queued yet), this queues the switch itself.
   * False when the switch fails or takes too long.
   */
  const identitySettled = useCallback(async (): Promise<boolean> => {
    const deadline = Date.now() + IDENTITY_WAIT_MS;
    let queuedOwn = false;
    while (Date.now() < deadline) {
      if (identityPending.current > 0) {
        await Promise.race([
          identityChain.current,
          new Promise((resolve) => setTimeout(resolve, deadline - Date.now())),
        ]);
        continue;
      }
      if (sdkAccountId.current === accountIdRef.current) return true;
      if (queuedOwn) return false;
      queuedOwn = true;
      syncIdentity();
    }
    return false;
  }, [syncIdentity]);

  const refresh = useCallback(async () => {
    // The answer belongs to the account RevenueCat is on when it's asked, not whoever is signed in by the reply.
    const owner = sdkAccountId.current;
    return apply(await fetchCustomerInfo(), owner);
  }, [apply]);

  const showPaywall = useCallback(async (): Promise<PaywallOutcome> => {
    // Configuring before the session is read would lock RevenueCat to an anonymous id.
    if (!available || !sessionReady) return 'unavailable';
    let result: PaywallResult;
    try {
      await configureRevenueCat(accountIdRef.current);
      // A purchase made before logIn finishes would attach to the anonymous id. No paywall was shown, so nothing
      // was attempted: "unavailable", not "failed".
      if (!(await identitySettled())) return 'unavailable';
      result = await presentPaywall();
    } catch (err) {
      console.warn('Budgy: paywall failed', err);
      return 'unavailable';
    }
    if (result === 'error') return 'failed';
    if (result === 'cancelled') return 'dismissed';
    try {
      // A restore that found nothing also reports "restored".
      return (await refresh()) ? 'subscribed' : 'dismissed';
    } catch (err) {
      // The purchase stands; the listener delivers it once RevenueCat answers.
      console.warn('Budgy: customer info after the paywall failed', err);
      return 'subscribed';
    }
  }, [available, sessionReady, identitySettled, refresh]);

  const showCustomerCenter = useCallback(async () => {
    if (!available || !sessionReady) throw new Error('Budgy Pro is not available right now');
    await configureRevenueCat(accountIdRef.current);
    await presentCustomerCenter();
    // A cancel or plan change made there also arrives through the listener; this makes the account card current
    // the moment the screen closes.
    refresh().catch((err) => console.warn('Budgy: customer info after the Customer Center failed', err));
  }, [available, sessionReady, refresh]);

  const restore = useCallback(async () => {
    if (!available || !sessionReady) throw new Error('Budgy Pro is not available right now');
    await configureRevenueCat(accountIdRef.current);
    if (!(await identitySettled())) throw new Error('RevenueCat is not on the signed-in account');
    const owner = sdkAccountId.current;
    return apply(await restorePurchases(), owner);
  }, [available, sessionReady, identitySettled, apply]);

  const recheck = useCallback(() => {
    if (!available || !sessionReady) return;
    configureRevenueCat(accountIdRef.current)
      .then(() => {
        if (identityPending.current === 0) syncIdentity();
      })
      .catch((err) => console.warn('Budgy: RevenueCat configure failed', err));
  }, [available, sessionReady, syncIdentity]);

  const value = useMemo<ProValue>(
    () => ({ gateOn, available, isPro, ready, plan, hadPro, accountId, appUserId, showPaywall, showCustomerCenter, restore, recheck }),
    [gateOn, available, isPro, ready, plan, hadPro, accountId, appUserId, showPaywall, showCustomerCenter, restore, recheck],
  );

  return <ProContext.Provider value={value}>{children}</ProContext.Provider>;
}

export function usePro(): ProValue {
  const ctx = useContext(ProContext);
  if (!ctx) throw new Error('usePro must be used inside ProProvider');
  return ctx;
}
