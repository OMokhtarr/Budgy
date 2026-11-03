import { IonIcon } from '@ionic/react';
import { personOutline } from 'ionicons/icons';
import { useSettings } from '@/core/contexts/SettingsContext';

/** The user's avatar: the first letter of their name on their colour, or a person icon before a name is set. */
export default function ProfileAvatar({ size = 34 }: { size?: number }) {
  const { profileName, profileColor } = useSettings();
  const initial = profileName.trim().charAt(0).toUpperCase();
  return (
    <span className="b-profile-avatar" style={{ width: size, height: size, fontSize: size * 0.45, background: profileColor }}>
      {initial || <IonIcon icon={personOutline} />}
    </span>
  );
}
