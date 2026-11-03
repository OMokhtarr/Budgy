import { useMemo, useState } from 'react';
import { IonButton, IonContent, IonHeader, IonIcon, IonPage, IonToolbar } from '@ionic/react';
import { checkmarkOutline, createOutline, swapVerticalOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { usePeriod } from '@/core/contexts/PeriodContext';
import { useConverter, useMoney } from '@/core/contexts/SettingsContext';
import { useTxEditor } from '@/core/contexts/TxEditorContext';
import { useFilteredTransactionsInRange } from '@/core/contexts/AccountFilterContext';
import { totalsOf, useCategories, useNames } from '@/core/db/hooks';
import AppHeader from '@/shared/components/AppHeader';
import PeriodBar from '@/shared/components/PeriodBar';
import Donut from '@/shared/components/Donut';
import Bubble from '@/shared/components/Bubble';
import MoneyText from '@/shared/components/MoneyText';
import CategoryEditModal from './CategoryEditModal';
import type { Category, Flow } from '@/shared/models';

/**
 * Main screen, 1Money-style: categories arranged around a donut of the period's spending.
 * Tap a category to add a transaction to it.
 */
export default function CategoriesPage() {
  const { t } = useTranslation();
  const money = useMoney();
  const conv = useConverter();
  const openEditor = useTxEditor();
  const { categoryName } = useNames();
  const { range, mode } = usePeriod();

  const [kind, setKind] = useState<Flow>('expense');
  const [editMode, setEditMode] = useState(false);
  const [editing, setEditing] = useState<Category | 'new' | null>(null);

  const categories = useCategories(kind);
  const archived = (useCategories(kind, true) ?? []).filter((c) => c.archived);
  const txs = useFilteredTransactionsInRange(range);
  const totals = useMemo(() => totalsOf(txs, conv.toBase), [txs, conv]);

  const slices = (categories ?? []).map((c) => ({ value: totals.byCategory[kind].get(c.id!) ?? 0, color: c.color }));
  const isExpense = kind === 'expense';

  // A category's total in each currency it was used in (main currency first); "EGP 0" when unused.
  const amountLines = (c: Category) => {
    const lines = Object.entries(totals.byCategoryCur[kind].get(c.id!) ?? {})
      .filter(([, n]) => n !== 0)
      .sort(([a], [b]) => (a === conv.base ? -1 : b === conv.base ? 1 : a.localeCompare(b)));
    return (lines.length ? lines : [[conv.base, 0] as [string, number]]).map(([cur, n]) => (
      <span key={cur} className="b-bubble__line">
        <MoneyText currency={cur} text={money.compact(n)} />
      </span>
    ));
  };

  const tap = (c: Category) => {
    if (editMode) setEditing(c);
    else openEditor({ type: kind, categoryId: c.id });
  };

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <AppHeader
          end={
            <IonButton onClick={() => setEditMode((v) => !v)} aria-label={editMode ? t('common.done') : t('common.edit')}>
              <IonIcon slot="icon-only" icon={editMode ? checkmarkOutline : createOutline} />
            </IonButton>
          }
        />
        <IonToolbar className="b-toolbar">
          <PeriodBar />
        </IonToolbar>
      </IonHeader>

      <IonContent>
        <div className="b-page">
          {editMode && <p className="b-muted" style={{ textAlign: 'center', fontSize: 13, margin: '10px 0 0' }}>{t('categories.editHint')}</p>}

          <div className="b-catgrid">
            {/* Tapping the middle switches between expense and income categories. */}
            <button
              className="b-catgrid__center"
              onClick={() => setKind(isExpense ? 'income' : 'expense')}
              aria-label={t('categories.switchKind')}
            >
              <Donut slices={slices}>
                <div className="b-catgrid__label">
                  {isExpense ? t('type.expenses') : t('type.incomes')}
                  <IonIcon icon={swapVerticalOutline} />
                </div>
                <div className={`b-num ${isExpense ? 'b-expense' : 'b-income'}`} style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.2 }}>
                  <MoneyText currency={conv.base} text={money.plain(isExpense ? totals.expense : totals.income)} />
                </div>
                <div className={`b-num ${isExpense ? 'b-income' : 'b-expense'}`} style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>
                  <MoneyText currency={conv.base} text={money.plain(isExpense ? totals.income : totals.expense)} />
                </div>
              </Donut>
            </button>

            {categories?.map((c) => {
              const spent = totals.byCategory[kind].get(c.id!) ?? 0;
              const progress = isExpense && mode === 'month' && c.budget ? spent / c.budget : undefined;
              return (
                <Bubble
                  key={c.id}
                  name={categoryName(c)}
                  icon={c.icon}
                  color={c.color}
                  amount={amountLines(c)}
                  progress={progress}
                  muted={spent === 0 && !editMode}
                  onClick={() => tap(c)}
                />
              );
            })}

            {editMode && (
              <Bubble name={t('categories.add')} icon="other" color="" variant="add" amount="" onClick={() => setEditing('new')} />
            )}
          </div>

          {editMode && archived.length > 0 && (
            <>
              <div className="b-section-title">{t('categories.archived')}</div>
              <div className="b-catgrid b-archived">
                {archived.map((c) => (
                  <Bubble key={c.id} name={categoryName(c)} icon={c.icon} color={c.color} muted onClick={() => setEditing(c)} />
                ))}
              </div>
            </>
          )}
        </div>
      </IonContent>

      <CategoryEditModal
        isOpen={editing != null}
        category={editing === 'new' ? undefined : editing ?? undefined}
        kind={kind}
        onClose={() => setEditing(null)}
      />
    </IonPage>
  );
}
