import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import type { CalendarPeriodMode, DateRange, PeriodMode } from '@/shared/models';
import { addDays, rangeFor, shiftAnchor, shiftRange, startOfDay } from '@/core/utils/period';
import { useSettings } from './SettingsContext';

interface PeriodContextValue {
  mode: PeriodMode;
  anchor: Date;
  range: DateRange;
  setMode: (m: CalendarPeriodMode) => void;
  pickDay: (day: Date) => void;
  /** Shows a custom range, from `first` to `last`, both included. */
  pickRange: (first: Date, last: Date) => void;
  prev: () => void;
  next: () => void;
  today: () => void;
}

const PeriodContext = createContext<PeriodContextValue | null>(null);

/** The selected time period is shared by the Categories, Transactions and Overview tabs, like in 1Money. */
export function PeriodProvider({ children }: { children: React.ReactNode }) {
  const { weekStart } = useSettings();
  const [mode, setMode] = useState<PeriodMode>('month');
  const [anchor, setAnchor] = useState(() => new Date());
  const [custom, setCustom] = useState<DateRange>(() => rangeFor('month', new Date()));

  // Phones keep the app alive in the background. If the user was looking at the current period when
  // they left, follow today when they come back (Oct 31 → Nov 1), or new transactions seem to vanish.
  const lastSeen = useRef(Date.now());
  useEffect(() => {
    const check = () => {
      const now = Date.now();
      // A custom range stays where the user put it.
      if (mode !== 'range') {
        const r = rangeFor(mode, anchor, weekStart);
        const inRange = (ms: number) => ms >= r.start.getTime() && ms < r.end.getTime();
        if (inRange(lastSeen.current) && !inRange(now)) setAnchor(new Date(now));
      }
      lastSeen.current = now;
    };
    const leave = () => {
      lastSeen.current = Date.now();
    };
    const onVisibility = () => (document.visibilityState === 'visible' ? check() : leave());
    document.addEventListener('visibilitychange', onVisibility);
    const handles = Capacitor.isNativePlatform()
      ? [CapApp.addListener('resume', check), CapApp.addListener('pause', leave)]
      : [];
    // The app can also stay open on screen past midnight: the moment before counts as last seen.
    let timer = 0;
    const scheduleMidnight = () => {
      const midnight = new Date();
      midnight.setHours(24, 0, 0, 0);
      timer = window.setTimeout(() => {
        lastSeen.current = midnight.getTime() - 1;
        check();
        scheduleMidnight();
      }, midnight.getTime() - Date.now() + 1000);
    };
    scheduleMidnight();
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      handles.forEach((h) => void h.then((x) => x.remove()));
      window.clearTimeout(timer);
    };
  }, [mode, anchor, weekStart]);

  const value = useMemo<PeriodContextValue>(() => {
    const move = (dir: 1 | -1) => {
      if (mode === 'range') setCustom((r) => shiftRange(r, dir));
      else setAnchor((a) => shiftAnchor(mode, a, dir));
    };
    return {
      mode,
      anchor,
      range: mode === 'range' ? custom : rangeFor(mode, anchor, weekStart),
      setMode: (m) => { setMode(m); setAnchor(new Date()); },
      pickDay: (day) => { setMode('day'); setAnchor(day); },
      pickRange: (first, last) => {
        setMode('range');
        setCustom({ start: startOfDay(first), end: addDays(startOfDay(last), 1) });
      },
      prev: () => move(-1),
      next: () => move(1),
      today: () => setAnchor(new Date()),
    };
  }, [mode, anchor, custom, weekStart]);

  return <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>;
}

export function usePeriod() {
  const ctx = useContext(PeriodContext);
  if (!ctx) throw new Error('usePeriod must be used inside PeriodProvider');
  return ctx;
}
