import type { ReactNode } from 'react';
import { IonIcon } from '@ionic/react';
import { addOutline } from 'ionicons/icons';
import { iconFor } from '@/shared/icons';

interface Props {
  name: string;
  icon: string;
  color: string;
  amount?: ReactNode;
  /** 0..1+ — draws a budget ring around the icon when provided. */
  progress?: number;
  muted?: boolean;
  selected?: boolean;
  variant?: 'add';
  className?: string;
  onClick?: () => void;
}

/** Round category/account button used in the category grid and pickers. */
export default function Bubble({ name, icon, color, amount, progress, muted, selected, variant, className, onClick }: Props) {
  let ring = 'transparent';
  if (progress != null) {
    const pct = Math.min(progress, 1) * 360;
    const c = progress > 1 ? 'var(--b-expense)' : color;
    ring = `conic-gradient(${c} ${pct}deg, var(--b-track) ${pct}deg)`;
  }
  const cls = ['b-bubble', muted && 'b-bubble--muted', variant === 'add' && 'b-bubble--add', selected && 'is-selected', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={cls} onClick={onClick} type="button">
      <span className="b-bubble__name">{name}</span>
      <span className="b-bubble__ring" style={{ background: ring }}>
        <span className="b-bubble__icon" style={variant === 'add' ? undefined : { background: color }}>
          <IonIcon icon={variant === 'add' ? addOutline : iconFor(icon)} />
        </span>
      </span>
      {amount != null && (
        <span className="b-bubble__amount b-num" style={{ color: muted ? undefined : color }}>
          {amount}
        </span>
      )}
    </button>
  );
}
