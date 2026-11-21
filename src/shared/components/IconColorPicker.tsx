import { useEffect, useState } from 'react';
import { IonIcon } from '@ionic/react';
import { chevronBackOutline, chevronForwardOutline } from 'ionicons/icons';
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

const groupOf = (name: string | undefined) => Math.max(0, ICON_GROUPS.findIndex((g) => name != null && g.icons.includes(name)));

/** One icon group at a time, paged with previous / next around the group's name. */
export function IconPicker({ icon, color, onIcon }: IconProps) {
  const { t } = useTranslation();
  const selected = canonicalIcon(icon);
  const [page, setPage] = useState(() => groupOf(selected));
  // The icon can be set after the picker mounts (an editor filling itself in, another subcategory opened):
  // show the group that holds it. Picking inside the current group keeps the page.
  useEffect(() => {
    setPage(groupOf(selected));
  }, [selected]);

  const count = ICON_GROUPS.length;
  const step = (by: number) => setPage((p) => (p + by + count) % count);
  const group = ICON_GROUPS[page];

  return (
    <div className="b-field">
      <span>{t('editor.icon')}</span>
      <div className="b-icon-nav">
        <button type="button" className="b-icon-nav__btn" onClick={() => step(-1)} aria-label={t('editor.previousIcons')}>
          <IonIcon icon={chevronBackOutline} className="b-flip" />
        </button>
        <div className="b-icon-nav__title">
          {t(`icons.groups.${group.key}`)}
          <small>{page + 1} / {count}</small>
        </div>
        <button type="button" className="b-icon-nav__btn" onClick={() => step(1)} aria-label={t('editor.nextIcons')}>
          <IonIcon icon={chevronForwardOutline} className="b-flip" />
        </button>
      </div>
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
            <IonIcon icon={ICONS[name]} />
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
