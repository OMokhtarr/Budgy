import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { IonIcon } from '@ionic/react';
import { addOutline } from 'ionicons/icons';
import { iconFor } from '@/shared/icons';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color' | 'onClick'> {
  name: string;
  icon: string;
  color: string;
  amount?: ReactNode;
  /** 0..1+ — draws a budget ring around the icon when provided. */
  progress?: number;
  muted?: boolean;
  selected?: boolean;
  variant?: 'add';
  /** A rectangle instead of a circle: an account among the categories. */
  square?: boolean;
  /** Lifted, being dragged to a new place. */
  dragging?: boolean;
  className?: string;
  onClick?: () => void;
}

/** Round category/account button used in the category grid and pickers. */
export default function Bubble({ name, icon, color, amount, progress, muted, selected, variant, square, dragging, className, onClick, ...rest }: Props) {
  let ring = 'transparent';
  if (progress != null) {
    const pct = Math.min(progress, 1) * 360;
    const c = progress > 1 ? 'var(--b-expense)' : color;
    ring = `conic-gradient(${c} ${pct}deg, var(--b-track) ${pct}deg)`;
  }
  const cls = ['b-bubble', muted && 'b-bubble--muted', variant === 'add' && 'b-bubble--add', square && 'b-bubble--square', selected && 'is-selected', dragging && 'is-dragging', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button {...rest} className={cls} style={{ '--c': color } as CSSProperties} onClick={onClick} type="button">
      <span className="b-bubble__name">{name}</span>
      <span className="b-bubble__ring" style={{ background: ring }}>
        <span className="b-bubble__icon">
          <IonIcon icon={variant === 'add' ? addOutline : iconFor(icon)} />
        </span>
      </span>
      {amount != null && (
        <span className="b-bubble__amount b-num">{amount}</span>
      )}
    </button>
  );
}
