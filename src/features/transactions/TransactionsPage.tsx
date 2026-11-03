import { useEffect, useMemo, useState } from 'react';
import {
  IonButton, IonButtons, IonContent, IonDatetime, IonFab, IonFabButton, IonFooter, IonHeader, IonIcon, IonItem, IonList,
  IonModal, IonPage, IonPopover, IonSearchbar, IonToolbar, useIonActionSheet, useIonAlert, useIonToast,
} from '@ionic/react';
import {
  addOutline, arrowDownOutline, arrowUpOutline, checkboxOutline, checkmarkOutline, closeCircle, closeOutline,
  ellipsisVertical, filterOutline, receiptOutline, searchOutline, squareOutline, swapHorizontalOutline, trashOutline,
} from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { usePeriod } from '@/core/contexts/PeriodContext';
import { useConverter, useLocale, useMoney } from '@/core/contexts/SettingsContext';
import { useTxEditor } from '@/core/contexts/TxEditorContext';
import { useFilteredTransactionsInRange } from '@/core/contexts/AccountFilterContext';
import { categoryFits, totalsOf, useAccounts, useCategories, useLookups, useNames } from '@/core/db/hooks';
import { addDays, dayKey, isSameDay } from '@/core/utils/period';
import { useLongPress } from '@/shared/hooks/useLongPress';
import { iconFor } from '@/shared/icons';
import AppHeader from '@/shared/components/AppHeader';
import PeriodBar from '@/shared/components/PeriodBar';
import Avatar from '@/shared/components/Avatar';
import MoneyText from '@/shared/components/MoneyText';
import { deleteMany, moveToAccount, moveToCategory, moveToDay } from './bulk';
import type { Transaction } from '@/shared/models';

/** What the category filter matches on: a category, or all transfers. */
const filterKey = (x: Transaction) => (x.type === 'transfer' ? 'transfer' : `c${x.categoryId}`);

export default function TransactionsPage() {
  const { t } = useTranslation();
  const money = useMoney();
  const conv = useConverter();
  const locale = useLocale();
  const openEditor = useTxEditor();
  const { range } = usePeriod();
  const { accounts, categories } = useLookups();
  const activeAccounts = useAccounts();
  const activeCategories = useCategories();
  const { accountName, categoryName } = useNames();
  const [presentSheet] = useIonActionSheet();
  const [presentAlert] = useIonAlert();
  const [presentToast] = useIonToast();

  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filter, setFilter] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moreEvent, setMoreEvent] = useState<Event | undefined>();
  const [dateOpen, setDateOpen] = useState(false);
  const selecting = selected.size > 0;

  const txs = useFilteredTransactionsInRange(range);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (txs ?? []).filter((x) => {
      if (filter.size && !filter.has(filterKey(x))) return false;
      if (!q) return true;
      const hay = [
        x.note,
        categoryName(categories.get(x.categoryId!)),
        accountName(accounts.get(x.accountId)),
        x.toAccountId != null ? accountName(accounts.get(x.toAccountId)) : '',
        String(x.amount),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [txs, query, filter, categories, accounts, categoryName, accountName]);

  const totals = useMemo(() => totalsOf(filtered, conv.toBase), [filtered, conv]);
  const chosen = useMemo(() => filtered.filter((x) => selected.has(x.id!)), [filtered, selected]);

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const x of filtered) {
      const k = dayKey(new Date(x.date));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(x);
    }
    return [...map.entries()];
  }, [filtered]);

  // ── selection mode (long-press a transaction) ──
  const clearSelection = () => setSelected(new Set());
  const toggle = (x: Transaction) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(x.id!)) next.delete(x.id!);
      else next.add(x.id!);
      return next;
    });
  const bind = useLongPress<Transaction>(
    (x) => {
      Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
      setSelected((s) => new Set(s).add(x.id!));
    },
    (x) => (selecting ? toggle(x) : openEditor({ tx: x })),
  );
  const allSelected = filtered.length > 0 && chosen.length === filtered.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(filtered.map((x) => x.id!)));

  // Changing the period or a filter drops transactions that are no longer listed from the selection.
  useEffect(() => {
    setSelected((s) => {
      if (!s.size) return s;
      const visible = new Set(filtered.map((x) => x.id!));
      const next = new Set([...s].filter((id) => visible.has(id)));
      return next.size === s.size ? s : next;
    });
  }, [filtered]);

  // The summary bar takes the tab bar's place; the hardware back button leaves selection mode.
  useEffect(() => {
    document.body.classList.toggle('b-selecting', selecting);
    if (!selecting) return;
    const onBack = (e: Event) => (e as CustomEvent).detail.register(100, clearSelection);
    document.addEventListener('ionBackButton', onBack);
    return () => {
      document.body.classList.remove('b-selecting');
      document.removeEventListener('ionBackButton', onBack);
    };
  }, [selecting]);

  const toast = (message: string) => presentToast({ message, duration: 2200, position: 'top', color: 'medium' });
  const finish = (skipped: number) => {
    if (skipped) toast(t('transactions.skipped', { count: skipped }));
    clearSelection();
  };

  const removeSelected = () =>
    presentAlert({
      header: t('transactions.deleteMany', { count: chosen.length }),
      message: t('editor.deleteMessage'),
      buttons: [
        { text: t('common.cancel'), role: 'cancel' },
        { text: t('common.delete'), role: 'destructive', handler: () => deleteMany(chosen).then(clearSelection) },
      ],
    });

  /** Bulk changes can't be undone, so each is confirmed with how many transactions it touches. */
  const confirm = (header: string, run: () => Promise<number>) =>
    presentAlert({
      header,
      buttons: [
        { text: t('common.cancel'), role: 'cancel' },
        { text: t('transactions.apply'), handler: () => void run().then(finish) },
      ],
    });

  const changeAccount = () =>
    presentSheet({
      header: t('transactions.changeAccount'),
      buttons: [
        ...(activeAccounts ?? []).map((a) => ({
          text: accountName(a),
          handler: () => void confirm(t('transactions.confirmAccount', { count: chosen.length, name: accountName(a) }), () => moveToAccount(chosen, a)),
        })),
        { text: t('common.cancel'), role: 'cancel' },
      ],
    });

  const changeCategory = () => {
    const flows = chosen.filter((x) => x.type !== 'transfer');
    if (!flows.length) return toast(t('transactions.noCategory'));
    // Only categories every selected expense/income can go into.
    const fits = (activeCategories ?? []).filter((c) => flows.every((x) => x.type !== 'transfer' && categoryFits(c, x.type)));
    presentSheet({
      header: t('transactions.changeCategory'),
      buttons: [
        ...fits.map((c) => ({
          text: categoryName(c),
          handler: () => void confirm(t('transactions.confirmCategory', { count: flows.length, name: categoryName(c) }), () => moveToCategory(chosen, c)),
        })),
        { text: t('common.cancel'), role: 'cancel' },
      ],
    });
  };

  /** Shows only transactions in the selected transactions' categories. */
  const filterBySelection = () => {
    setFilter(new Set(chosen.map(filterKey)));
    clearSelection();
  };
  const removeFilter = (k: string) =>
    setFilter((f) => {
      const next = new Set(f);
      next.delete(k);
      return next;
    });

  const dayLabel = (k: string) => {
    const [y, m, d] = k.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const today = new Date();
    if (isSameDay(date, today)) return t('period.today');
    if (isSameDay(date, addDays(today, -1))) return t('period.yesterday');
    return new Intl.DateTimeFormat(locale, {
      weekday: 'long', day: 'numeric', month: 'long',
      year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
    }).format(date);
  };

  /** Expenses (2) · EGP 320 — the selection's or the filtered list's totals, in the main currency. */
  const sumOf = (list: Transaction[], type: Transaction['type']) => {
    const of = list.filter((x) => x.type === type);
    return { count: of.length, value: of.reduce((s, x) => s + conv.toBase(x.amount, x.currency), 0) };
  };
  const filteredNet = totals.income - totals.expense;

  const avatarFor = (x: Transaction) => {
    if (selected.has(x.id!)) {
      return (
        <span className="b-avatar b-avatar--check">
          <IonIcon icon={checkmarkOutline} />
        </span>
      );
    }
    if (x.type === 'transfer') return <Avatar icon="transfer" color="var(--b-transfer)" />;
    const cat = categories.get(x.categoryId!);
    return <Avatar icon={cat?.icon ?? 'other'} color={cat?.color ?? '#64748b'} />;
  };

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        {selecting ? (
          <IonToolbar className="b-toolbar b-selbar">
            <IonButtons slot="start">
              <IonButton onClick={clearSelection} aria-label={t('common.close')}>
                <IonIcon slot="icon-only" icon={closeOutline} />
              </IonButton>
              <span className="b-selbar__count">{chosen.length}</span>
            </IonButtons>
            <IonButtons slot="end">
              <IonButton onClick={toggleAll} aria-label={t('transactions.selectAll')}>
                <IonIcon slot="icon-only" icon={allSelected ? checkboxOutline : squareOutline} />
              </IonButton>
              <IonButton onClick={removeSelected} aria-label={t('common.delete')}>
                <IonIcon slot="icon-only" icon={trashOutline} />
              </IonButton>
              <IonButton onClick={(e) => setMoreEvent(e.nativeEvent)} aria-label={t('transactions.more')}>
                <IonIcon slot="icon-only" icon={ellipsisVertical} />
              </IonButton>
            </IonButtons>
          </IonToolbar>
        ) : (
          <AppHeader
            end={
              <IonButton
                onClick={() => {
                  if (searchOpen) setQuery('');
                  setSearchOpen((v) => !v);
                }}
                aria-label={t('transactions.searchToggle')}
              >
                <IonIcon slot="icon-only" icon={searchOpen ? closeOutline : searchOutline} />
              </IonButton>
            }
          />
        )}
        <IonToolbar className="b-toolbar">
          <PeriodBar />
        </IonToolbar>
      </IonHeader>

      <IonContent>
        <div className="b-page">
          {searchOpen && (
            <IonSearchbar
              className="b-search"
              value={query}
              debounce={150}
              placeholder={t('transactions.search')}
              onIonInput={(e) => setQuery(e.detail.value ?? '')}
            />
          )}

          {filter.size > 0 ? (
            <>
              <div className="b-filterchips">
                {[...filter].map((k) => {
                  const cat = k === 'transfer' ? undefined : categories.get(k.slice(1));
                  return (
                    <button
                      key={k}
                      className="b-filterchip"
                      style={{ background: cat?.color ?? 'var(--b-transfer)' }}
                      onClick={() => removeFilter(k)}
                      aria-label={t('transactions.removeFilter')}
                    >
                      <IonIcon icon={cat ? iconFor(cat.icon) : swapHorizontalOutline} />
                      {cat ? categoryName(cat) : t('type.transfer')}
                      <IonIcon icon={closeCircle} />
                    </button>
                  );
                })}
              </div>
              <div className="b-filtersum">
                <span>{t('transactions.count', { count: filtered.length })}</span>
                <span className={`b-num ${filteredNet < 0 ? 'b-expense' : filteredNet > 0 ? 'b-income' : ''}`}>
                  <MoneyText currency={conv.base} text={money.plain(Math.abs(filteredNet))} />
                </span>
              </div>
            </>
          ) : (
            <div className="b-tiles">
              <div className="b-card b-tile">
                <div className="b-tile__label">
                  <IonIcon icon={arrowDownOutline} className="b-income" /> {t('type.incomes')}
                </div>
                <div className="b-tile__value b-income b-num">{money.format(totals.income)}</div>
              </div>
              <div className="b-card b-tile">
                <div className="b-tile__label">
                  <IonIcon icon={arrowUpOutline} className="b-expense" /> {t('type.expenses')}
                </div>
                <div className="b-tile__value b-expense b-num">{money.format(totals.expense)}</div>
              </div>
            </div>
          )}

          {txs && groups.length === 0 && (
            <div className="b-empty">
              <IonIcon icon={receiptOutline} />
              {query || filter.size ? t('transactions.noMatches') : t('transactions.empty')}
            </div>
          )}

          {groups.map(([k, list]) => {
            const net = list.reduce((s, x) => {
              const v = conv.toBase(x.amount, x.currency);
              return s + (x.type === 'income' ? v : x.type === 'expense' ? -v : 0);
            }, 0);
            return (
              <div key={k}>
                <div className="b-dayhead">
                  <span>{dayLabel(k)}</span>
                  <span className={`b-num ${net < 0 ? 'b-expense' : net > 0 ? 'b-income' : ''}`}>
                    {net > 0 ? '+' : ''}
                    {money.format(net)}
                  </span>
                </div>
                <div className="b-card" style={{ overflow: 'hidden' }}>
                  {list.map((x) => {
                    const acc = accounts.get(x.accountId);
                    const cls = `b-row ${selected.has(x.id!) ? 'is-selected' : ''}`;
                    if (x.type === 'transfer') {
                      const to = accounts.get(x.toAccountId!);
                      return (
                        <button key={x.id} className={cls} {...bind(x)}>
                          {avatarFor(x)}
                          <div className="b-row__main">
                            <div className="b-row__title">{t('type.transfer')}</div>
                            <div className="b-row__sub">
                              {accountName(acc)} → {accountName(to)}
                              {x.note ? ` · ${x.note}` : ''}
                            </div>
                          </div>
                          <div className="b-row__amount b-transfer b-num">
                            {money.format(x.amount, x.currency)}
                            {x.toAmount != null && x.toCurrency && <small>→ {money.format(x.toAmount, x.toCurrency)}</small>}
                          </div>
                        </button>
                      );
                    }
                    const cat = categories.get(x.categoryId!);
                    const isExp = x.type === 'expense';
                    return (
                      <button key={x.id} className={cls} {...bind(x)}>
                        {avatarFor(x)}
                        <div className="b-row__main">
                          <div className="b-row__title">{categoryName(cat)}</div>
                          <div className="b-row__sub">
                            {accountName(acc)}
                            {x.note ? ` · ${x.note}` : ''}
                          </div>
                        </div>
                        <div className={`b-row__amount b-num ${isExp ? 'b-expense' : 'b-income'}`}>
                          {isExp ? '−' : '+'}
                          {money.format(x.amount, x.currency)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <IonFab slot="fixed" vertical="bottom" horizontal="end">
          {selecting ? (
            <IonFabButton className="b-fab" onClick={filterBySelection} aria-label={t('transactions.filterBySelection')}>
              <IonIcon icon={filterOutline} />
            </IonFabButton>
          ) : (
            <IonFabButton className="b-fab" onClick={() => openEditor()} aria-label={t('transactions.add')}>
              <IonIcon icon={addOutline} />
            </IonFabButton>
          )}
        </IonFab>
      </IonContent>

      {selecting && (
        <IonFooter className="b-selsum">
          {(['expense', 'income', 'transfer'] as const).map((type) => {
            const s = sumOf(chosen, type);
            if (!s.count) return null;
            const label = type === 'expense' ? t('type.expenses') : type === 'income' ? t('type.incomes') : t('type.transfers');
            return (
              <div key={type} className="b-selsum__item">
                <span>
                  {label} <em>({s.count})</em>
                </span>
                <span className={`b-num b-${type}`}>
                  <MoneyText currency={conv.base} text={money.plain(s.value)} />
                </span>
              </div>
            );
          })}
        </IonFooter>
      )}

      {/* ⋮ menu: change the date, account or category of every selected transaction */}
      <IonPopover isOpen={moreEvent != null} event={moreEvent} onDidDismiss={() => setMoreEvent(undefined)} className="b-popmenu">
        <IonList lines="none">
          <IonItem button detail={false} onClick={() => { setMoreEvent(undefined); setDateOpen(true); }}>
            {t('transactions.changeDate')}
          </IonItem>
          <IonItem button detail={false} onClick={() => { setMoreEvent(undefined); changeAccount(); }}>
            {t('transactions.changeAccount')}
          </IonItem>
          <IonItem button detail={false} onClick={() => { setMoreEvent(undefined); changeCategory(); }}>
            {t('transactions.changeCategory')}
          </IonItem>
        </IonList>
      </IonPopover>

      <IonModal className="b-date-modal" isOpen={dateOpen} onDidDismiss={() => setDateOpen(false)}>
        <IonDatetime
          presentation="date"
          locale={locale}
          onIonChange={(e) => {
            const v = e.detail.value;
            setDateOpen(false);
            if (typeof v !== 'string') return;
            const day = v.slice(0, 10);
            const [y, m, d] = day.split('-').map(Number);
            const label = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(y, m - 1, d));
            void confirm(t('transactions.confirmDate', { count: chosen.length, date: label }), () => moveToDay(chosen, day));
          }}
        />
      </IonModal>
    </IonPage>
  );
}
