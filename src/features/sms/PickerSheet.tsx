import { IonIcon, IonModal } from '@ionic/react';
import { closeOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import Bubble from '@/shared/components/Bubble';

export interface PickerItem {
  id: string;
  name: string;
  icon: string;
  color: string;
}

/** A second, titled group under the main one, ending with an "add" bubble. */
export interface PickerSection {
  title: string;
  items: PickerItem[];
  addLabel: string;
  onAdd(): void;
}

interface Props {
  isOpen: boolean;
  /** Shown at the top of the sheet. */
  title?: string;
  items: PickerItem[];
  selectedId?: string;
  /** Picking from it also calls `onPick`. */
  section?: PickerSection;
  onPick(id: string): void;
  onClose(): void;
}

/** Bottom sheet with a grid of accounts or categories, as in the editor's picker. Picking calls `onPick`, then `onClose`. */
export default function PickerSheet({ isOpen, title, items, selectedId, section, onPick, onClose }: Props) {
  const { t } = useTranslation();

  const grid = (list: PickerItem[], add?: PickerSection) => (
    <div className="b-picker__grid">
      {list.map((it) => (
        <Bubble
          key={it.id}
          className="b-picker__item"
          name={it.name}
          icon={it.icon}
          color={it.color}
          selected={it.id === selectedId}
          onClick={() => {
            onPick(it.id);
            onClose();
          }}
        />
      ))}
      {add && (
        <Bubble
          className="b-picker__item"
          name={add.addLabel}
          icon="other"
          color=""
          variant="add"
          onClick={() => {
            onClose();
            add.onAdd();
          }}
        />
      )}
    </div>
  );

  return (
    <IonModal className="b-sheet-modal" isOpen={isOpen} breakpoints={[0, 1]} initialBreakpoint={1} handle={false} onDidDismiss={onClose}>
      <div className="b-sheet b-pickersheet">
        <div className="b-sheet__head">
          <button className="b-iconbtn" onClick={onClose} aria-label={t('common.close')}>
            <IonIcon icon={closeOutline} />
          </button>
          {title && <h2>{title}</h2>}
        </div>
        <div className="b-sheet__body">
          {grid(items)}
          {section && (
            <>
              <h3 className="b-pickersheet__section">{section.title}</h3>
              {grid(section.items, section)}
            </>
          )}
        </div>
      </div>
    </IonModal>
  );
}
