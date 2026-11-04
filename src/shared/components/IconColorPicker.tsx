import { IonIcon } from '@ionic/react';
import { useTranslation } from 'react-i18next';
import { COLORS, ICONS } from '@/shared/icons';

interface IconProps {
  icon: string;
  color: string;
  onIcon: (name: string) => void;
}

interface Props extends IconProps {
  onColor: (hex: string) => void;
}

export function IconPicker({ icon, color, onIcon }: IconProps) {
  const { t } = useTranslation();
  return (
    <div className="b-field">
      <span>{t('editor.icon')}</span>
      <div className="b-swatches">
        {Object.entries(ICONS).map(([name, svg]) => (
          <button
            key={name}
            type="button"
            className={`b-swatch ${name === icon ? 'is-selected' : ''}`}
            style={name === icon ? { background: color, color: '#fff' } : undefined}
            onClick={() => onIcon(name)}
            aria-label={name}
          >
            <IonIcon icon={svg} />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function IconColorPicker({ icon, color, onIcon, onColor }: Props) {
  const { t } = useTranslation();
  return (
    <>
      <div className="b-field">
        <span>{t('editor.color')}</span>
        <div className="b-swatches">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`b-swatch ${c === color ? 'is-selected' : ''}`}
              style={{ background: c }}
              onClick={() => onColor(c)}
              aria-label={c}
            />
          ))}
        </div>
      </div>
      <IconPicker icon={icon} color={color} onIcon={onIcon} />
    </>
  );
}
