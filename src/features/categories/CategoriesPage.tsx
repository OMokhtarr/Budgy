import { useMemo, useState } from 'react';
import { IonButton, IonContent, IonHeader, IonIcon, IonPage, IonToolbar } from '@ionic/react';
import { useTranslation } from 'react-i18next';
import { usePeriod } from '@/core/contexts/PeriodContext';
import { useConverter, useMoney } from '@/core/contexts/SettingsContext';
import { useTxEditor } from '@/core/contexts/TxEditorContext';
import { useAccountFilter, useFilteredTransactionsInRange } from '@/core/contexts/AccountFilterContext';
import { reorderCategories } from '@/core/db/db';
import { totalsOf, useAccounts, useCategories, useNames } from '@/core/db/hooks';
import AppHeader from '@/shared/components/AppHeader';
import PeriodBar from '@/shared/components/PeriodBar';
import { usePeriodSwipe } from '@/shared/hooks/useSwipe';
import { useDragReorder } from '@/shared/hooks/useDragReorder';
import Donut from '@/shared/components/Donut';
import Bubble from '@/shared/components/Bubble';
import MoneyText from '@/shared/components/MoneyText';
import { doneIcon, editIcon } from '@/shared/icons';
import AccountEditModal from '@/features/accounts/AccountEditModal';
import CategoryEditModal from './CategoryEditModal';
import type { Account, Amounts, Category, Flow } from '@/shared/models';

/**
 * Main screen, 1Money-style: categories arranged around a donut of the period's spending.
 * Tap a category to add a transaction to it. Every account follows as a square tile: tap one to send
 * it money. Money sent to a debt or savings counts as spending and shows on its tile; an everyday tile
 * shows no amount. In edit mode, hold a category and drag it to move it.
 */
export default function CategoriesPage() {
  const { t } = useTranslation();
  const money = useMoney();
  const conv = useConverter();
  const openEditor = useTxEditor();
  const { accountName, categoryName } = useNames();
  const { tiles } = useAccountFilter();
  const { range, mode } = usePeriod();
  const contentRef = usePeriodSwipe();

  const [kind, setKind] = useState<Flow>('expense');
  const [editMode, setEditMode] = useState(false);
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  const categories = useCategories(kind);
  // While a category is dragged the grid shows the order it would drop into.
  const { order, dragging, itemProps } = useDragReorder(
    (categories ?? []).map((c) => c.id!),
    (ids) => void reorderCategories(ids),
    editMode,
  );
  const byId = new Map((categories ?? []).map((c) => [c.id!, c]));
  const shown = order.map((id) => byId.get(id)).filter((c): c is Category => !!c);
  const archived = (useCategories(kind, true) ?? []).filter((c) => c.archived);
  const txs = useFilteredTransactionsInRange(range);
  const totals = useMemo(() => totalsOf(txs, conv, tiles), [txs, conv, tiles]);

  const accounts = useAccounts();
  // Every account has a tile, like every category; only debts and savings carry spending.
  const tileAccounts = accounts ?? [];
  const isSpending = (a: Account) => tiles.tileIds.has(a.id!);
  const sentTo = (a: Account) => totals.byTile.get(a.id!)?.value ?? 0;

  const isExpense = kind === 'expense';
  const slices = [
    ...(categories ?? []).map((c) => ({ value: totals.byCategory[kind].get(c.id!) ?? 0, color: c.color })),
    ...(isExpense ? tileAccounts.filter(isSpending).map((a) => ({ value: sentTo(a), color: a.color })) : []),
  ];

  // A total in each currency it was made in (main currency first); "EGP 0" when there is nothing yet.
  const amountLines = (amounts: Amounts | undefined, emptyCurrency: string) => {
    const lines = Object.entries(amounts ?? {})
      .filter(([, n]) => n !== 0)
      .sort(([a], [b]) => (a === conv.base ? -1 : b === conv.base ? 1 : a.localeCompare(b)));
    return (lines.length ? lines : [[emptyCurrency, 0] as [string, number]]).map(([cur, n]) => (
      <span key={cur} className="b-bubble__line">
        <MoneyText currency={cur} text={money.plain(n, cur)} />
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
              <IonIcon slot="icon-only" icon={editMode ? doneIcon : editIcon} />
            </IonButton>
          }
        />
        <IonToolbar className="b-toolbar">
          <PeriodBar />
        </IonToolbar>
      </IonHeader>

      <IonContent ref={contentRef}>
        <div className="b-page b-catpage">
          {editMode && <p className="b-muted" style={{ textAlign: 'center', fontSize: 13, margin: '10px 0 0' }}>{t('categories.editHint')}</p>}

          <div className={`b-catgrid ${editMode ? 'b-catgrid--edit' : ''}`}>
            {/* Tapping the middle switches between expense and income categories. */}
            <button
              className="b-catgrid__center"
              onClick={() => setKind(isExpense ? 'income' : 'expense')}
              aria-label={t('categories.switchKind')}
            >
              <Donut slices={slices} size={200} thickness={11}>
                <div className="b-catgrid__label">{isExpense ? t('type.expenses') : t('type.incomes')}</div>
                <div className={`b-catgrid__main b-num ${isExpense ? 'b-expense' : 'b-income'}`}>
                  <MoneyText currency={conv.base} text={money.plain(isExpense ? totals.expense : totals.income)} />
                </div>
                <div className={`b-catgrid__sub b-num ${isExpense ? 'b-income' : 'b-expense'}`}>
                  <MoneyText currency={conv.base} text={money.plain(isExpense ? totals.income : totals.expense)} />
                </div>
              </Donut>
            </button>

            {shown.map((c) => {
              const spent = totals.byCategory[kind].get(c.id!) ?? 0;
              const progress = isExpense && mode === 'month' && c.budget ? spent / c.budget : undefined;
              return (
                <Bubble
                  key={c.id}
                  name={categoryName(c)}
                  icon={c.icon}
                  color={c.color}
                  amount={amountLines(totals.byCategoryCur[kind].get(c.id!), conv.base)}
                  progress={progress}
                  muted={spent === 0 && !editMode}
                  onClick={() => tap(c)}
                  dragging={dragging === c.id}
                  {...itemProps(c.id!)}
                />
              );
            })}

            {editMode && (
              <Bubble name={t('categories.add')} icon="other" color="" variant="add" amount="" onClick={() => setEditing('new')} />
            )}

            {isExpense &&
              tileAccounts.map((a) => (
                <Bubble
                  key={a.id}
                  square
                  name={accountName(a)}
                  icon={a.icon}
                  color={a.color}
                  amount={isSpending(a) ? amountLines(totals.byTile.get(a.id!)?.amounts, a.currency) : undefined}
                  muted={isSpending(a) && sentTo(a) === 0 && !editMode}
                  onClick={() => (editMode ? setEditingAccount(a) : openEditor({ type: 'transfer', toAccountId: a.id }))}
                />
              ))}
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
      <AccountEditModal isOpen={editingAccount != null} account={editingAccount ?? undefined} onClose={() => setEditingAccount(null)} />
    </IonPage>
  );
}
