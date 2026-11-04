import { IonIcon } from '@ionic/react';
import { personOutline } from 'ionicons/icons';
import { useSettings } from '@/core/contexts/SettingsContext';
import { initials } from '@/core/utils/initials';

/** The user's avatar: the initials of their name on their colour, or a person icon before a name is set. */
export default function ProfileAvatar({ size = 34 }: { size?: number }) {
  const { profileName, profileColor } = useSettings();
  return (
    <span className="b-profile-avatar" style={{ width: size, height: size, fontSize: size * 0.4, background: profileColor }}>
      {initials(profileName) || <IonIcon icon={personOutline} />}
    </span>
  );
}
