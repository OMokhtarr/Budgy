import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { decimalsOf, roundTo } from '@/core/utils/currency';
import type { Amounts } from '@/shared/models';

export type ThemePref = 'system' | 'light' | 'dark';
export type BalanceView = 'sum' | 'split';

export interface Settings {
  /** Main currency: totals and reports are shown in it. */
  currency: string;
  /** Manual exchange rates: how many units of the main currency one unit of each currency is worth. */
  rates: Record<string, number>;
  /** Show multi-currency balances added up in one currency, or split per currency. */
  balanceView: BalanceView;
  /** Shown in the side menu and on the Profile page. */
  profileName: string;
  profileColor: string;
  /** ISO time of the last backup made from the app. */
  lastBackupAt?: string;
  theme: ThemePref;
  /** 0 = Sunday, 1 = Monday, 6 = Saturday */
  weekStart: number;
  /** When a synced setting (see BACKUP_KEYS) last changed, for "last edit wins" with other devices. */
  syncedUpdatedAt?: string;
  /** A synced setting changed on this device and hasn't been uploaded yet. */
  syncedDirty?: boolean;
  /** Reading bank texts (Android). Per device: not backed up or synced, since it's about this phone's inbox. */
  smsImport: SmsImportSettings;
}

export interface SmsImportSettings {
  enabled: boolean;
  /** Sender keywords; a text is read when its sender name contains one of them (ignoring case). */
  senders: string[];
  /** ISO time of the last inbox scan. */
  lastScanAt?: string;
}

interface SettingsContextValue extends Settings {
  update: (patch: Partial<Settings>) => void;
  /** Sets (or clears, with undefined) the rate of one currency against the main one. */
  setRate: (currency: string, rate: number | undefined) => void;
  /** Applies settings downloaded by sync, without marking them for upload again. */
  applySynced: (data: Partial<BackupSettings>, updatedAt: string) => void;
  /** Sync uploaded the settings stamped `updatedAt`; clears the upload mark unless they changed since. */
  markSyncedClean: (updatedAt: string) => void;
}

const STORAGE_KEY = 'budgy-settings';
const DEFAULTS: Settings = {
  currency: 'EGP',
  rates: {},
  balanceView: 'sum',
  profileName: '',
  profileColor: '#10b981',
  theme: 'system',
  weekStart: 6,
  smsImport: { enabled: false, senders: [] },
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

/** Settings that travel with a backup; theme and language stay a per-device choice. */
const BACKUP_KEYS = ['currency', 'rates', 'balanceView', 'weekStart', 'profileName', 'profileColor'] as const;
export type BackupSettings = Pick<Settings, (typeof BACKUP_KEYS)[number]>;

/** The backed-up part of `s` (a live settings object or one read from a backup file). */
export function backupSettingsOf(s: Partial<Settings> | undefined): Partial<BackupSettings> {
  const out: Partial<Record<keyof BackupSettings, unknown>> = {};
  for (const k of BACKUP_KEYS) if (s?.[k] != null) out[k] = s[k];
  return out as Partial<BackupSettings>;
}

/** Main currency as saved on this device (for code that runs outside React, e.g. DB upgrades). */
export function savedCurrency(): string {
  return load().currency;
}

/**
 * Re-expresses the rates relative to a new main currency, so changing it keeps them correct.
 * Needs a rate for `to`; without one there is nothing to pivot on and every rate is dropped.
 */
export function rebaseRates(rates: Record<string, number>, from: string, to: string): Record<string, number> {
  const pivot = rates[to];
  if (!pivot) return {};
  const next: Record<string, number> = { [from]: round6(1 / pivot) };
  for (const [c, r] of Object.entries(rates)) if (c !== to) next[c] = round6(r / pivot);
  return next;
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

const SettingsContext = createContext<SettingsContextValue>({
  ...DEFAULTS,
  update: () => {},
  setRate: () => {},
  applySynced: () => {},
  markSyncedClean: () => {},
});

/** Stamps a change to any synced setting so sync uploads it. */
function stampIfSynced(prev: Settings, next: Settings): Settings {
  const changed = BACKUP_KEYS.some((k) => JSON.stringify(prev[k]) !== JSON.stringify(next[k]));
  return changed ? { ...next, syncedUpdatedAt: new Date().toISOString(), syncedDirty: true } : next;
}

function applyTheme(theme: ThemePref) {
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('ion-palette-dark', !!dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b1220' : '#10b981');
  // Android draws the app edge-to-edge (Capacitor 8), so the status bar icons sit on the app's own
  // background: light icons on the dark theme, dark icons on the light one, whatever the device theme.
  if (Capacitor.isNativePlatform()) {
    StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
  }
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(load);

  useEffect(() => {
    applyTheme(settings.theme);
    if (settings.theme !== 'system') return;
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq?.addEventListener?.('change', onChange);
    return () => mq?.removeEventListener?.('change', onChange);
  }, [settings.theme]);

  // Every change goes through here so it is also saved on the device.
  const change = useCallback((fn: (prev: Settings) => Settings) => {
    setSettings((prev) => {
      const next = fn(prev);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }, []);

  const update = useCallback(
    (patch: Partial<Settings>) =>
      change((prev) => {
        const next = { ...prev, ...patch };
        if (patch.currency && patch.currency !== prev.currency && !patch.rates) {
          next.rates = rebaseRates(prev.rates, prev.currency, patch.currency);
        }
        return stampIfSynced(prev, next);
      }),
    [change],
  );

  const setRate = useCallback(
    (cur: string, rate: number | undefined) =>
      change((prev) => {
        const rates = { ...prev.rates };
        if (rate && rate > 0) rates[cur] = rate;
        else delete rates[cur];
        return stampIfSynced(prev, { ...prev, rates });
      }),
    [change],
  );

  const applySynced = useCallback(
    (data: Partial<BackupSettings>, updatedAt: string) =>
      change((prev) => ({ ...prev, ...backupSettingsOf(data), syncedUpdatedAt: updatedAt, syncedDirty: false })),
    [change],
  );

  const markSyncedClean = useCallback(
    (updatedAt: string) => change((prev) => (prev.syncedUpdatedAt === updatedAt ? { ...prev, syncedDirty: false } : prev)),
    [change],
  );

  const value = useMemo(
    () => ({ ...settings, update, setRate, applySynced, markSyncedClean }),
    [settings, update, setRate, applySynced, markSyncedClean],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  return useContext(SettingsContext);
}

/** Locale used for number/date formatting; Arabic keeps Latin digits for readability. */
export function useLocale(): string {
  const { i18n } = useTranslation();
  return i18n.language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US';
}

/** Returns a money formatter bound to the user's language; amounts default to the main currency. */
export function useMoney() {
  const { currency } = useSettings();
  const locale = useLocale();
  return useMemo(() => {
    // Each currency shows up to its own decimals: 2 for EGP, 3 for KWD, none for JPY.
    const cache = new Map<string, Intl.NumberFormat>();
    const formatter = (cur: string) => {
      let nf = cache.get(cur);
      if (!nf) {
        const digits = decimalsOf(cur);
        try {
          nf = new Intl.NumberFormat(locale, { style: 'currency', currency: cur, maximumFractionDigits: digits, minimumFractionDigits: 0 });
        } catch {
          nf = new Intl.NumberFormat(locale, { maximumFractionDigits: digits });
        }
        cache.set(cur, nf);
      }
      return nf;
    };
    const plainCache = new Map<number, Intl.NumberFormat>();
    const plainFor = (digits: number) => {
      let nf = plainCache.get(digits);
      if (!nf) {
        nf = new Intl.NumberFormat(locale, { maximumFractionDigits: digits });
        plainCache.set(digits, nf);
      }
      return nf;
    };
    const compact = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 });
    return {
      format: (n: number, cur = currency) => formatter(cur).format(n),
      /** The number alone, without a currency, e.g. "16,050" (decimals as `cur` uses them). */
      plain: (n: number, cur = currency) => plainFor(decimalsOf(cur)).format(n),
      /** Short form for tight spaces, e.g. "12.5K". */
      compact: (n: number) => (Math.abs(n) >= 10000 ? compact.format(n) : new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n)),
    };
  }, [currency, locale]);
}

export interface Converter {
  base: string;
  /** Units of the main currency per unit of `cur`, or undefined when no rate is set. */
  rate: (cur: string) => number | undefined;
  /** Converts between any two currencies via the main one; undefined when a rate is missing. */
  convert: (n: number, from: string, to: string) => number | undefined;
  /** Converts to the main currency; amounts without a rate count as 0 (see `sum` to detect them). */
  toBase: (n: number, cur: string) => number;
  /** Adds up amounts in several currencies into `to`, listing currencies that have no rate. */
  sum: (amounts: Amounts, to?: string) => { value: number; missing: string[] };
}

export function useConverter(): Converter {
  const { currency: base, rates } = useSettings();
  return useMemo(() => {
    const rate = (cur: string) => (cur === base ? 1 : rates[cur] || undefined);
    const convert = (n: number, from: string, to: string) => {
      if (from === to) return n;
      const a = rate(from);
      const b = rate(to);
      return a && b ? roundTo((n * a) / b, to) : undefined;
    };
    return {
      base,
      rate,
      convert,
      toBase: (n, cur) => convert(n, cur, base) ?? 0,
      sum: (amounts, to = base) => {
        let value = 0;
        const missing: string[] = [];
        for (const [cur, n] of Object.entries(amounts)) {
          const v = convert(n, cur, to);
          if (v == null) {
            if (n !== 0) missing.push(cur);
          } else value += v;
        }
        return { value: roundTo(value, to), missing };
      },
    };
  }, [base, rates]);
}

export const CURRENCIES = [
  'EGP', 'USD', 'EUR', 'GBP', 'SAR', 'AED', 'QAR', 'KWD', 'BHD', 'OMR', 'JOD', 'MAD', 'TRY', 'INR', 'PKR', 'CAD', 'AUD', 'JPY', 'CNY', 'CHF',
];
