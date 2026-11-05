import { Fragment, useMemo, useState } from 'react';
import { IonContent, IonHeader, IonIcon, IonPage, IonToolbar } from '@ionic/react';
import { pieChartOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { alive, db } from '@/core/db/db';
import { usePeriod } from '@/core/contexts/PeriodContext';
import { useConverter, useLocale, useMoney, useSettings } from '@/core/contexts/SettingsContext';
import { useAccountFilter, useFilteredTransactionsInRange } from '@/core/contexts/AccountFilterContext';
import { subcategoryBreakdown, totalsOf, useAccounts, useCategories, useNames } from '@/core/db/hooks';
import { spentOnTile } from '@/core/utils/accountTiles';
import { txInBase } from '@/core/utils/txRate';
import AppHeader from '@/shared/components/AppHeader';
import { rangeFor, shiftBy, shiftRange } from '@/core/utils/period';
import PeriodBar from '@/shared/components/PeriodBar';
import { usePeriodSwipe } from '@/shared/hooks/useSwipe';
import Avatar from '@/shared/components/Avatar';
import Donut from '@/shared/components/Donut';
import type { Category, Flow, PeriodMode } from '@/shared/models';

const BUCKETS: Record<PeriodMode, number> = { day: 7, week: 6, month: 6, year: 5, all: 5, range: 6 };

export default function OverviewPage() {
  const { t } = useTranslation();
  const money = useMoney();
  const conv = useConverter();
  const locale = useLocale();
  const { weekStart } = useSettings();
  const { range, mode, anchor } = usePeriod();
  const { accountName, categoryName } = useNames();
  const [kind, setKind] = useState<Flow>('expense');
  const contentRef = usePeriodSwipe();

  const txs = useFilteredTransactionsInRange(range);
  const { matches, tiles } = useAccountFilter();
  const totals = useMemo(() => totalsOf(txs, conv, tiles), [txs, conv, tiles]);
  const accounts = useAccounts(true);
  const categories = useCategories(kind, true);
  const expenseCats = useCategories('expense');

  // ── trend buckets (the selected period and the ones before it) ──
  const bucketMode = mode === 'all' ? 'year' : mode;
  const buckets = useMemo(() => {
    const n = BUCKETS[mode];
    return Array.from({ length: n }, (_, i) => {
      const back = -(n - 1 - i);
      return bucketMode === 'range' ? shiftRange(range, back) : rangeFor(bucketMode, shiftBy(bucketMode, anchor, back), weekStart);
    });
  }, [mode, bucketMode, anchor, range, weekStart]);

  const trend = useLiveQuery(async () => {
    const s = buckets[0].start.toISOString();
    const e = buckets[buckets.length - 1].end.toISOString();
    const rows = await db.transactions.where('date').between(s, e, true, false).filter(alive).toArray();
    return buckets.map((b) => {
      const bs = b.start.toISOString();
      const be = b.end.toISOString();
      let inc = 0;
      let exp = 0;
      for (const r of rows) {
        if (r.date < bs || r.date >= be || !matches(r)) continue;
        if (r.type === 'income') inc += txInBase(r, conv);
        else if (r.type === 'expense') exp += txInBase(r, conv);
        else exp += spentOnTile(r, tiles, conv);
      }
      return { inc, exp };
    });
  }, [buckets, conv, matches, tiles]);

  const bucketLabel = (d: Date) => {
    const o: Intl.DateTimeFormatOptions =
      bucketMode === 'day' ? { weekday: 'short' } : bucketMode === 'week' || bucketMode === 'range' ? { day: 'numeric', month: 'short' } : bucketMode === 'month' ? { month: 'short' } : { year: 'numeric' };
    return new Intl.DateTimeFormat(locale, o).format(d);
  };
  const maxBar = Math.max(1, ...(trend ?? []).flatMap((x) => [x.inc, x.exp]));

  // ── stats ──
  const net = totals.income - totals.expense;
  const days = useMemo(() => {
    if (mode === 'all') {
      const first = txs?.length ? new Date(txs[txs.length - 1].date) : new Date();
      return Math.max(1, Math.ceil((Date.now() - first.getTime()) / 86400000));
    }
    const end = Math.min(range.end.getTime(), Date.now());
    return Math.max(1, Math.ceil((end - range.start.getTime()) / 86400000));
  }, [mode, range, txs]);

  // ── breakdown ──
  const kindTotal = kind === 'expense' ? totals.expense : totals.income;
  const breakdown = [
    ...(categories ?? []).map((c) => ({
      key: c.id!, name: categoryName(c), icon: c.icon, color: c.color, square: false, category: c as Category | undefined, v: totals.byCategory[kind].get(c.id!) ?? 0,
    })),
    ...(kind === 'expense' ? accounts ?? [] : []).filter((a) => tiles.tileIds.has(a.id!)).map((a) => ({
      key: a.id!, name: accountName(a), icon: a.icon, color: a.color, square: true, category: undefined, v: totals.byTile.get(a.id!)?.value ?? 0,
    })),
  ]
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v);
  // Money coming back can bring the total below what the rows add up to; shares stay within 100%.
  const shareOf = Math.max(kindTotal, breakdown.reduce((s, x) => s + x.v, 0));

  const budgets = mode === 'month' ? (expenseCats ?? []).filter((c) => c.budget) : [];
  const budgetTotal = budgets.reduce((s, c) => s + (c.budget ?? 0), 0);
  const budgetSpent = budgets.reduce((s, c) => s + (totals.byCategory.expense.get(c.id!) ?? 0), 0);

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <AppHeader />
        <IonToolbar className="b-toolbar">
          <PeriodBar />
        </IonToolbar>
      </IonHeader>
      <IonContent ref={contentRef}>
        <div className="b-page">
          <div className="b-tiles">
            <div className="b-card b-tile">
              <div className="b-tile__label">{t('type.incomes')}</div>
              <div className="b-tile__value b-income b-num">{money.format(totals.income)}</div>
            </div>
            <div className="b-card b-tile">
              <div className="b-tile__label">{t('type.expenses')}</div>
              <div className="b-tile__value b-expense b-num">{money.format(totals.expense)}</div>
            </div>
            <div className="b-card b-tile">
              <div className="b-tile__label">{t('overview.net')}</div>
              <div className={`b-tile__value b-num ${net < 0 ? 'b-expense' : 'b-income'}`}>
                {net > 0 ? '+' : ''}
                {money.format(net)}
              </div>
            </div>
            <div className="b-card b-tile">
              <div className="b-tile__label">{t('overview.avgPerDay')}</div>
              <div className="b-tile__value b-num">{money.format(totals.expense / days)}</div>
            </div>
          </div>

          {/* Trend */}
          <div className="b-section-title">{t('overview.trend')}</div>
          <div className="b-card" style={{ padding: 14 }}>
            <div className="b-legend">
              <span><i style={{ background: 'var(--b-income)' }} />{t('type.incomes')}</span>
              <span><i style={{ background: 'var(--b-expense)' }} />{t('type.expenses')}</span>
            </div>
            <div className="b-bars">
              {buckets.map((b, i) => {
                const v = trend?.[i] ?? { inc: 0, exp: 0 };
                const current = mode !== 'all' && b.start.getTime() === range.start.getTime();
                return (
                  <div key={i} className={`b-bars__group ${current ? 'is-current' : ''}`}>
                    <div className="b-bars__cols">
                      <span className="b-bars__col" style={{ height: `${(v.inc / maxBar) * 100}%`, background: 'var(--b-income)', opacity: current ? 1 : 0.55 }} />
                      <span className="b-bars__col" style={{ height: `${(v.exp / maxBar) * 100}%`, background: 'var(--b-expense)', opacity: current ? 1 : 0.55 }} />
                    </div>
                    <span className="b-bars__label">{bucketLabel(b.start)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Budgets */}
          {budgets.length > 0 && (
            <>
              <div className="b-section-title">{t('overview.budgets')}</div>
              <div className="b-card" style={{ padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginBottom: 8 }}>
                  <span>{t('overview.totalBudget')}</span>
                  <span className="b-num">
                    {money.format(budgetSpent)} <span className="b-muted">/ {money.format(budgetTotal)}</span>
                  </span>
                </div>
                <div className="b-bar" style={{ marginBottom: 16 }}>
                  <span style={{ width: `${Math.min(100, (budgetSpent / budgetTotal) * 100)}%`, background: budgetSpent > budgetTotal ? 'var(--b-expense)' : 'var(--ion-color-primary)' }} />
                </div>
                {budgets.map((c) => {
                  const spent = totals.byCategory.expense.get(c.id!) ?? 0;
                  const left = (c.budget ?? 0) - spent;
                  const over = left < 0;
                  return (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <Avatar icon={c.icon} color={c.color} size="sm" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 600, marginBottom: 5 }}>
                          <span>{categoryName(c)}</span>
                          <span className={`b-num ${over ? 'b-expense' : 'b-muted'}`}>
                            {over ? t('overview.over', { amount: money.format(-left) }) : t('overview.left', { amount: money.format(left) })}
                          </span>
                        </div>
                        <div className="b-bar">
                          <span style={{ width: `${Math.min(100, (spent / (c.budget ?? 1)) * 100)}%`, background: over ? 'var(--b-expense)' : c.color }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Breakdown */}
          <div className="b-section-title">{t('overview.byCategory')}</div>
          <div className="b-pills" style={{ marginBottom: 10 }}>
            <button className={kind === 'expense' ? 'is-active' : ''} onClick={() => setKind('expense')}>{t('type.expenses')}</button>
            <button className={kind === 'income' ? 'is-active' : ''} onClick={() => setKind('income')}>{t('type.incomes')}</button>
          </div>
          {breakdown.length === 0 ? (
            <div className="b-empty">
              <IonIcon icon={pieChartOutline} />
              {t('overview.noData')}
            </div>
          ) : (
            <div className="b-card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                <Donut size={150} thickness={20} slices={breakdown.map((x) => ({ value: x.v, color: x.color }))}>
                  <div className="b-num" style={{ fontWeight: 800, fontSize: 16 }}>{money.format(kindTotal)}</div>
                </Donut>
              </div>
              {breakdown.map(({ key, name, icon, color, square, category, v }) => {
                const pct = shareOf ? (v / shareOf) * 100 : 0;
                const { subs, rest } = category ? subcategoryBreakdown(category, kind, totals) : { subs: [], rest: 0 };
                return (
                  <Fragment key={key}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <Avatar icon={icon} color={color} size="sm" square={square} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 600, marginBottom: 5 }}>
                          <span>
                            {name} <span className="b-muted">· {pct.toFixed(pct < 10 ? 1 : 0)}%</span>
                          </span>
                          <span className="b-num">{money.format(v)}</span>
                        </div>
                        <div className="b-bar">
                          <span style={{ width: `${pct}%`, background: color }} />
                        </div>
                      </div>
                    </div>
                    {subs.length > 0 && (
                      <div className="b-subrows">
                        {subs.map(({ sub, value }) => (
                          <div key={sub.id} className="b-subrow">
                            <Avatar icon={sub.icon} color={color} size="sm" />
                            <span className="b-subrow__name">{sub.name}</span>
                            <span className="b-num">{money.format(value)}</span>
                          </div>
                        ))}
                        {rest > 0 && (
                          <div className="b-subrow">
                            <span className="b-subrow__blank" />
                            <span className="b-subrow__name b-muted">{t('overview.noSubcategory')}</span>
                            <span className="b-num">{money.format(rest)}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
}
