import { IonIcon } from '@ionic/react';
import { useTranslation } from 'react-i18next';
import { COLORS, ICON_GROUPS, ICONS, canonicalIcon } from '@/shared/icons';

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
  const selected = canonicalIcon(icon);
  return (
    <div className="b-field">
      <span>{t('editor.icon')}</span>
      {ICON_GROUPS.map((group) => (
        <section key={group.key} className="b-icon-group">
          <h3 className="b-icon-group__title">{t(`icons.groups.${group.key}`)}</h3>
          <div className="b-swatches">
            {group.icons.map((name) => (
              <button
                key={name}
                type="button"
                className={`b-swatch ${name === selected ? 'is-selected' : ''}`}
                style={name === selected ? { background: color, color: '#fff' } : undefined}
                onClick={() => onIcon(name)}
                aria-label={name}
              >
                {/* lazy: only the icons scrolled into view get drawn. */}
                <IonIcon icon={ICONS[name]} lazy />
              </button>
            ))}
          </div>
        </section>
      ))}
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
