import { useState, type CSSProperties } from 'react';
import { IonButton, IonIcon, useIonAlert } from '@ionic/react';
import { addOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { alive, db } from '@/core/db/db';
import { newId } from '@/core/utils/id';
import { cleanSubcategories, withoutSubcategory } from '@/core/utils/subcategories';
import { IconPicker } from '@/shared/components/IconColorPicker';
import { iconFor } from '@/shared/icons';
import type { Subcategory } from '@/shared/models';

interface Props {
  subcategories: Subcategory[];
  /** What's stored now, so a saved subcategory left blank keeps its name. */
  saved?: Subcategory[];
  /** The category's colour, and its icon as the starting icon for a new subcategory. */
  color: string;
  icon: string;
  onChange: (list: Subcategory[]) => void;
}

/** The category screen's list of subcategories. Changes only count once that screen is saved. */
export default function SubcategoriesField({ subcategories, saved, color, icon, onChange }: Props) {
  const { t } = useTranslation();
  const [presentAlert] = useIonAlert();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = subcategories.find((s) => s.id === openId);

  const patch = (changes: Partial<Subcategory>) => onChange(subcategories.map((s) => (s.id === openId ? { ...s, ...changes } : s)));

  const toggle = (id: string) => {
    onChange(cleanSubcategories(subcategories, saved));
    setOpenId(openId === id ? null : id);
  };

  const add = () => {
    const sub = { id: newId(), name: '', icon };
    onChange([...cleanSubcategories(subcategories, saved), sub]);
    setOpenId(sub.id);
  };

  const restore = () => {
    patch({ archived: undefined });
    setOpenId(null);
  };

  const remove = async (id: string) => {
    const used = await db.transactions.filter((x) => alive(x) && x.subcategoryId === id).count();
    presentAlert({
      header: t('categories.deleteSubcategoryTitle'),
      message: used ? t('categories.deleteSubcategoryUsed', { count: used }) : t('categories.deleteSubcategoryMessage'),
      buttons: [
        { text: t('common.cancel'), role: 'cancel' },
        {
          text: t('common.delete'),
          role: 'destructive',
          handler: () => {
            onChange(withoutSubcategory(subcategories, id, used));
            setOpenId(null);
          },
        },
      ],
    });
  };

  return (
    <div className="b-field">
      <span>{t('categories.subcategories')}</span>
      <div className="b-subchips" style={{ '--c': color } as CSSProperties}>
        {subcategories.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`b-subchip ${s.id === openId ? 'is-on' : ''} ${s.archived ? 'is-archived' : ''}`}
            onClick={() => toggle(s.id)}
          >
            <IonIcon icon={iconFor(s.icon)} />
            {s.name || t('categories.newSubcategory')}
          </button>
        ))}
        <button type="button" className="b-subchip b-subchip--add" onClick={add}>
          <IonIcon icon={addOutline} />
          {t('categories.addSubcategory')}
        </button>
      </div>
      {open && (
        <div className="b-subform">
          <label className="b-field">
            <span>{t('editor.name')}</span>
            <input className="b-input" value={open.name} onChange={(e) => patch({ name: e.target.value })} maxLength={30} autoFocus={!open.name} />
          </label>
          <IconPicker icon={open.icon} color={color} onIcon={(name) => patch({ icon: name })} />
          {open.archived && (
            <IonButton expand="block" fill="clear" color="medium" onClick={restore}>
              {t('categories.restoreSubcategory')}
            </IonButton>
          )}
          <IonButton expand="block" fill="clear" color="danger" onClick={() => remove(open.id)}>
            {t('categories.deleteSubcategory')}
          </IonButton>
        </div>
      )}
    </div>
  );
}
