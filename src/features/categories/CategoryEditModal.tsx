import { useEffect, useState } from 'react';
import {
  IonButton, IonButtons, IonContent, IonHeader, IonModal, IonTitle, IonToolbar, useIonAlert, useIonToast,
} from '@ionic/react';
import { useTranslation } from 'react-i18next';
import { alive, db, softDelete } from '@/core/db/db';
import { useNames } from '@/core/db/hooks';
import { useSettings } from '@/core/contexts/SettingsContext';
import { cleanNumberInput, parseNumber } from '@/core/utils/number';
import IconColorPicker from '@/shared/components/IconColorPicker';
import Avatar from '@/shared/components/Avatar';
import type { Category, CategoryKind, Flow } from '@/shared/models';

interface Props {
  isOpen: boolean;
  category?: Category;
  /** Kind for a new category: the tab it was created from. */
  kind: Flow;
  onClose: () => void;
}

const KINDS: CategoryKind[] = ['expense', 'income', 'both'];

export default function CategoryEditModal({ isOpen, category, kind, onClose }: Props) {
  const { t } = useTranslation();
  const { currency } = useSettings();
  const { categoryName } = useNames();
  const [presentAlert] = useIonAlert();
  const [presentToast] = useIonToast();

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('cart');
  const [color, setColor] = useState('#10b981');
  const [budget, setBudget] = useState('');
  const [catKind, setCatKind] = useState<CategoryKind>(kind);

  useEffect(() => {
    if (!isOpen) return;
    setName(category ? categoryName(category) : '');
    setIcon(category?.icon ?? (kind === 'income' ? 'briefcase' : 'cart'));
    setColor(category?.color ?? '#10b981');
    setBudget(category?.budget ? String(category.budget) : '');
    setCatKind(category?.kind ?? kind);
  }, [isOpen, category, kind, categoryName]);

  const hasBudget = catKind !== 'income';

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const b = parseNumber(budget);
    // Narrowing to expense-only or income-only isn't allowed while transactions of the other type use it.
    if (category?.id != null && catKind !== 'both' && catKind !== category.kind) {
      const used = await db.transactions.where('categoryId').equals(category.id).filter((x) => alive(x) && x.type !== catKind).count();
      if (used) {
        const other = catKind === 'expense' ? 'income' : 'expense';
        presentToast({ message: t('categories.kindInUse', { count: used, type: t(`type.${other}`) }), duration: 3500, position: 'top', color: 'medium' });
        return;
      }
    }
    const patch = {
      // keep built-in categories translatable unless the user actually renamed them
      name: category && trimmed === categoryName(category) && category.key ? category.name : trimmed,
      icon,
      color,
      kind: catKind,
      budget: hasBudget && b > 0 ? b : undefined,
    };
    if (category?.id != null) {
      await db.categories.update(category.id, patch);
    } else {
      const order = await db.categories.where('kind').equals(catKind).count();
      await db.categories.add({ ...patch, order });
    }
    onClose();
  };

  /** Archived categories disappear from the grid and pickers but keep their transactions. */
  const setArchived = async (archived: boolean) => {
    if (category?.id == null) return;
    await db.categories.update(category.id, { archived: archived || undefined });
    onClose();
  };

  const remove = async () => {
    if (category?.id == null) return;
    const used = await db.transactions.where('categoryId').equals(category.id).filter(alive).count();
    presentAlert({
      header: t('categories.deleteTitle'),
      message: used ? t('categories.deleteUsed', { count: used }) : t('categories.deleteMessage'),
      buttons: [
        { text: t('common.cancel'), role: 'cancel' },
        {
          text: t('common.delete'),
          role: 'destructive',
          handler: async () => {
            if (used) await db.categories.update(category.id!, { archived: true });
            else await softDelete(db.categories, [category.id!]);
            onClose();
          },
        },
      ],
    });
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose}>
      <IonHeader>
        <IonToolbar className="b-toolbar">
          <IonButtons slot="start">
            <IonButton onClick={onClose}>{t('common.cancel')}</IonButton>
          </IonButtons>
          <IonTitle>{category ? t('categories.editTitle') : t(kind === 'expense' ? 'categories.newExpense' : 'categories.newIncome')}</IonTitle>
          <IonButtons slot="end">
            <IonButton strong onClick={save} disabled={!name.trim()}>
              {t('common.save')}
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <div className="b-page" style={{ paddingTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
            <div style={{ transform: 'scale(1.6)' }}>
              <Avatar icon={icon} color={color} />
            </div>
          </div>
          <label className="b-field">
            <span>{t('editor.name')}</span>
            <input className="b-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} autoFocus={!category} />
          </label>
          <div className="b-field">
            <span>{t('categories.kind')}</span>
            <div className="b-pills">
              {KINDS.map((k) => (
                <button key={k} className={catKind === k ? 'is-active' : ''} onClick={() => setCatKind(k)}>
                  {t(k === 'both' ? 'categories.both' : `type.${k}`)}
                </button>
              ))}
            </div>
            <div className="b-muted" style={{ fontSize: 12.5, margin: '6px 4px 0' }}>{t(`categories.kindHint.${catKind}`)}</div>
          </div>
          {hasBudget && (
            <label className="b-field">
              <span>{t('categories.monthlyBudget', { currency })}</span>
              <input
                className="b-input b-num"
                inputMode="decimal"
                placeholder={t('categories.noBudget')}
                value={budget}
                onChange={(e) => setBudget(cleanNumberInput(e.target.value))}
              />
            </label>
          )}
          <IconColorPicker icon={icon} color={color} onIcon={setIcon} onColor={setColor} />
          {category && (
            <>
              <IonButton expand="block" fill="clear" color="medium" onClick={() => setArchived(!category.archived)} style={{ marginTop: 12 }}>
                {category.archived ? t('categories.restore') : t('categories.archive')}
              </IonButton>
              <IonButton expand="block" fill="clear" color="danger" onClick={remove}>
                {t('categories.delete')}
              </IonButton>
            </>
          )}
        </div>
      </IonContent>
    </IonModal>
  );
}
