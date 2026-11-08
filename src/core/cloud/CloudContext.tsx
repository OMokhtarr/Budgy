import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useIonAlert } from '@ionic/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import type { User } from '@supabase/supabase-js';
import { useSettings } from '@/core/contexts/SettingsContext';
import { SYNCED_TABLES, db, seedIfEmpty } from '@/core/db/db';
import { SupabaseRemote, cloudEnabled, supabase } from './client';
import {
  deleteAccount as deleteCloudAccount,
  signIn as providerSignIn,
  signOut as providerSignOut,
  takeRedirectError,
  type Provider,
} from './auth';
import { hasWorkToSync, clearLocal, hasLocalTransactions, syncOnce, type SettingsPort, type SyncState } from './sync';

/**
 * Who is signed in, and the backup of their data to the account. Sync runs after sign-in and on start,
 * and a few seconds after each local change. When the app comes back to the front, when the connection
 * returns, and every few minutes while open, it only runs if something is left to send or finish.
 * Without cloud settings in the build (see `.env.example`) this is all off.
 */

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'error';

interface CloudValue {
  enabled: boolean;
  user: User | null;
  status: SyncStatus;
  lastSyncedAt?: string;
  signIn: (provider: Provider) => Promise<void>;
  /** `keepLocal: false` also removes the data from this device (it stays in the account). */
  signOut: (keepLocal: boolean) => Promise<void>;
  deleteAccount: (keepLocal: boolean) => Promise<void>;
  syncNow: () => void;
  /**
   * Replaces the local data (restore / erase) while no sync runs, then makes the account match it.
   * A sync that was already running could otherwise write the account's old records back in, or save
   * over the request to replace the account, so old categories and transactions would return.
   */
  replaceLocal: <T>(replace: () => Promise<T>) => Promise<T>;
  /** A failed web sign-in reported back in the URL, to show once. */
  redirectError?: string;
  clearRedirectError: () => void;
}

const CloudContext = createContext<CloudValue | null>(null);

/** The Data API rejected the session (HTTP 401, or PostgREST's "JWT expired" / "invalid JWT"). */
function isAuthError(err: unknown): boolean {
  const e = err as { status?: number; code?: string } | undefined;
  return e?.status === 401 || e?.code === 'PGRST301' || e?.code === 'PGRST302';
}

const AFTER_CHANGE_MS = 3000;
const RETRY_MS = 5 * 60_000;

interface Stored extends SyncState {
  lastSyncedAt?: string;
}
const stateKey = (userId: string) => `budgy-sync:${userId}`;
function loadState(userId: string): Stored {
  try {
    return JSON.parse(localStorage.getItem(stateKey(userId)) ?? '') as Stored;
  } catch {
    return { cursors: {} };
  }
}
function saveState(userId: string, state: Stored) {
  try {
    localStorage.setItem(stateKey(userId), JSON.stringify(state));
  } catch {
    /* storage unavailable: the next sync just starts over (safe, only slower) */
  }
}
function forgetState(userId: string) {
  try {
    localStorage.removeItem(stateKey(userId));
  } catch {
    /* ignore */
  }
}

export function CloudProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const settings = useSettings();
  const [presentAlert] = useIonAlert();
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<SyncStatus>(cloudEnabled ? 'idle' : 'off');
  const [lastSyncedAt, setLastSyncedAt] = useState<string>();

  // Sync reads the latest settings through a ref: it runs outside React's render cycle.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const port = useMemo<SettingsPort>(
    () => ({
      get: () => {
        const s = settingsRef.current;
        return {
          data: { currency: s.currency, rates: s.rates, balanceView: s.balanceView, weekStart: s.weekStart, profileName: s.profileName, profileColor: s.profileColor },
          updatedAt: s.syncedUpdatedAt,
          dirty: !!s.syncedDirty,
        };
      },
      apply: (data, updatedAt) => settingsRef.current.applySynced(data, updatedAt),
      markClean: (updatedAt) => settingsRef.current.markSyncedClean(updatedAt),
    }),
    [],
  );

  /** Empties this device's data (see `clearLocal`). Its bank texts go too, so the last scan is forgotten with them. */
  const clearLocalData = useCallback(async () => {
    await clearLocal(db);
    settingsRef.current.forgetLastScan();
  }, []);

  // ── Session ──
  const [redirectError, setRedirectError] = useState(() => (cloudEnabled ? takeRedirectError() : undefined));
  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    // Also fires SIGNED_OUT when the session ends elsewhere (account deleted on another phone,
    // refresh token revoked): the app just carries on offline with the data it has.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      // Same user, new token: keep the object so sync effects don't restart on every refresh.
      setUser((prev) => (session?.user && prev?.id === session.user.id ? prev : (session?.user ?? null)));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setLastSyncedAt(user ? loadState(user.id).lastSyncedAt : undefined);
    if (!user) setStatus(cloudEnabled ? 'idle' : 'off');
  }, [user]);

  /** On a device's first sync with an account that already has data, and data here too: ask. */
  const askHowToMerge = useCallback(
    () =>
      new Promise<'merge' | 'cloud' | 'cancel'>((resolve) =>
        presentAlert({
          header: t('cloud.mergeTitle'),
          message: t('cloud.mergeMessage'),
          backdropDismiss: false,
          buttons: [
            { text: t('cloud.mergeBoth'), handler: () => resolve('merge') },
            { text: t('cloud.useCloud'), handler: () => resolve('cloud') },
            { text: t('common.cancel'), role: 'cancel', handler: () => resolve('cancel') },
          ],
        }),
      ),
    [presentAlert, t],
  );

  // ── Sync ──
  const running = useRef(false);
  const again = useRef(false);
  /** Settles when the running sync ends. */
  const idle = useRef<Promise<void>>(Promise.resolve());
  /** Set while `replaceLocal` swaps the data: no sync may start. */
  const paused = useRef(false);
  const sync = useCallback(async () => {
    if (!supabase || !user || paused.current) return;
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    let ended!: () => void;
    idle.current = new Promise((resolve) => (ended = resolve));
    setStatus('syncing');
    try {
      const remote = new SupabaseRemote(supabase, user.id);
      let state = loadState(user.id);
      if (!state.synced && (await hasLocalTransactions(db)) && (await remote.hasTransactions())) {
        const choice = await askHowToMerge();
        if (choice === 'cancel') {
          await providerSignOut();
          setStatus('idle');
          return;
        }
        // "Use the account's data": empty this device first; the sync then downloads everything.
        if (choice === 'cloud') await clearLocalData();
      }
      state = { ...state, ...(await syncOnce(db, remote, port, state)) };
      const now = new Date().toISOString();
      saveState(user.id, { ...state, lastSyncedAt: now });
      setLastSyncedAt(now);
      setStatus('idle');
    } catch (err) {
      console.warn('Budgy: sync failed', err);
      setStatus('error');
      // The server no longer accepts the session (expired and couldn't refresh, or account deleted):
      // try one refresh; if that fails, sign out on this device and keep its data.
      if (isAuthError(err)) {
        const { error } = await supabase.auth.refreshSession();
        if (error) await supabase.auth.signOut({ scope: 'local' });
        else again.current = true;
      }
    } finally {
      running.current = false;
      ended();
      if (again.current) {
        again.current = false;
        void sync();
      }
    }
  }, [user, port, askHowToMerge, clearLocalData]);

  // After sign-in, and on start with a saved session.
  useEffect(() => {
    if (user) void sync();
  }, [user, sync]);

  // A few seconds after local changes (records or synced settings) — batched.
  const pending = useLiveQuery(async () => {
    const counts = await Promise.all(SYNCED_TABLES.map((t) => db.table(t).where('dirty').equals(1).count()));
    return counts.reduce((sum, n) => sum + n, 0);
  });
  const settingsDirty = !!settings.syncedDirty;
  const unsent = useRef(false);
  unsent.current = !!pending || settingsDirty;
  useEffect(() => {
    if (!user || (!pending && !settingsDirty)) return;
    const timer = window.setTimeout(() => void sync(), AFTER_CHANGE_MS);
    return () => window.clearTimeout(timer);
  }, [user, pending, settingsDirty, sync]);

  // Sync is this device's backup, so there's no need to ask the cloud for changes while the app is open.
  // Back in front, back online, and every few minutes: only send or finish what's left, retrying failures.
  useEffect(() => {
    if (!user) return;
    const run = () => {
      if (hasWorkToSync(loadState(user.id), unsent.current)) void sync();
    };
    const onVisible = () => document.visibilityState === 'visible' && run();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', run);
    const resume = Capacitor.isNativePlatform() ? CapApp.addListener('resume', run) : undefined;
    const timer = window.setInterval(() => document.visibilityState === 'visible' && run(), RETRY_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', run);
      void resume?.then((h) => h.remove());
      window.clearInterval(timer);
    };
  }, [user, sync]);

  // ── Actions ──
  const signIn = useCallback(
    async (provider: Provider) => {
      const { fullName } = await providerSignIn(provider);
      if (fullName && !settingsRef.current.profileName) settingsRef.current.update({ profileName: fullName });
    },
    [],
  );

  const removeLocalData = useCallback(async (userId: string) => {
    await clearLocalData();
    await seedIfEmpty(db);
    forgetState(userId);
  }, [clearLocalData]);

  const signOut = useCallback(
    async (keepLocal: boolean) => {
      if (!user) return;
      // Upload anything not sent yet, so removing it here loses nothing.
      if (!keepLocal) await sync();
      await providerSignOut();
      if (!keepLocal) await removeLocalData(user.id);
    },
    [user, sync, removeLocalData],
  );

  const deleteAccount = useCallback(
    async (keepLocal: boolean) => {
      if (!user) return;
      await deleteCloudAccount();
      forgetState(user.id);
      if (!keepLocal) await removeLocalData(user.id);
    },
    [user, removeLocalData],
  );

  const replaceLocal = useCallback(
    async <T,>(replace: () => Promise<T>): Promise<T> => {
      paused.current = true;
      try {
        // A finishing sync may start another (`again`); that one sees `paused` and returns at once.
        while (running.current) await idle.current;
        const result = await replace();
        if (user) saveState(user.id, { ...loadState(user.id), replaceCloud: true });
        return result;
      } finally {
        paused.current = false;
        void sync();
      }
    },
    [user, sync],
  );

  const value = useMemo<CloudValue>(
    () => ({
      enabled: cloudEnabled,
      user,
      status: !cloudEnabled ? 'off' : status,
      lastSyncedAt,
      signIn,
      signOut,
      deleteAccount,
      syncNow: () => void sync(),
      replaceLocal,
      redirectError,
      clearRedirectError: () => setRedirectError(undefined),
    }),
    [user, status, lastSyncedAt, signIn, signOut, deleteAccount, sync, replaceLocal, redirectError],
  );

  return <CloudContext.Provider value={value}>{children}</CloudContext.Provider>;
}

export function useCloud(): CloudValue {
  const ctx = useContext(CloudContext);
  if (!ctx) throw new Error('useCloud must be used inside CloudProvider');
  return ctx;
}
