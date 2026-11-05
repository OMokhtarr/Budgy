import { IonIcon } from '@ionic/react';
import { personOutline } from 'ionicons/icons';
import { useSettings } from '@/core/contexts/SettingsContext';
import { initials } from '@/core/utils/initials';

interface Props {
  size?: number;
  /** Before a name is set, draw a bare outlined icon instead of filling it with the user's colour. */
  outlined?: boolean;
}

/** The user's avatar: the initials of their name on their colour, or a person icon before a name is set. */
export default function ProfileAvatar({ size = 34, outlined }: Props) {
  const { profileName, profileColor } = useSettings();
  const text = initials(profileName);
  const bare = outlined && !text;
  return (
    <span
      className={`b-profile-avatar${bare ? ' is-bare' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.4, background: bare ? undefined : profileColor }}
    >
      {text || <IonIcon icon={personOutline} />}
    </span>
  );
}
