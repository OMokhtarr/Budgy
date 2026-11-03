import { IonIcon } from '@ionic/react';
import { iconFor } from '@/shared/icons';

export default function Avatar({ icon, color, size, square }: { icon: string; color: string; size?: 'sm'; square?: boolean }) {
  const cls = ['b-avatar', size === 'sm' && 'b-avatar--sm', square && 'b-avatar--square'].filter(Boolean).join(' ');
  return (
    <span className={cls} style={{ background: color }}>
      <IonIcon icon={iconFor(icon)} />
    </span>
  );
}
