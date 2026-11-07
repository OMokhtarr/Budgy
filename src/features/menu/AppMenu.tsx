import { IonBadge, IonContent, IonIcon, IonItem, IonLabel, IonList, IonMenu, IonMenuToggle, useIonAlert } from '@ionic/react';
import {
  chatboxEllipsesOutline, cloudOutline, headsetOutline, informationCircleOutline, personCircleOutline, serverOutline, settingsOutline, starOutline,
} from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { version } from '../../../package.json';
import { PLAY_STORE_URL, SUPPORT_EMAIL } from '@/core/config/links';
import { useLocale, useSettings } from '@/core/contexts/SettingsContext';
import { dayTimeLabel } from '@/core/utils/period';
import ProfileAvatar from '@/shared/components/ProfileAvatar';
import { useCloud } from '@/core/cloud/CloudContext';
import { usePendingCount } from '@/features/sms/hooks';
import { useSmsAvailable } from '@/features/sms/useSmsAvailable';

export const MENU_CONTENT_ID = 'main-content';

/** Side menu opened from the avatar at the top-left of the main tabs. */
export default function AppMenu() {
  const { t } = useTranslation();
  const locale = useLocale();
  const { profileName, lastBackupAt, smsImport } = useSettings();
  const showBankTexts = useSmsAvailable() && smsImport.enabled;
  const pending = usePendingCount();
  const { user, lastSyncedAt } = useCloud();
  const [presentAlert] = useIonAlert();

  const when = (iso: string) => dayTimeLabel(new Date(iso), locale, { today: t('period.today'), yesterday: t('period.yesterday') });
  // Signed in, sync is the backup: show when it last synced.
  const backupLabel = user
    ? lastSyncedAt ? t('cloud.synced', { when: when(lastSyncedAt) }) : t('cloud.notSynced')
    : lastBackupAt ? when(lastBackupAt) : t('menu.noBackup');

  const page = (path: string, icon: string, label: string, badge?: number) => (
    <IonMenuToggle key={path} autoHide={false}>
      <IonItem routerLink={path} routerDirection="forward" detail={false} lines="none" button>
        <IonIcon icon={icon} slot="start" />
        <IonLabel>{label}</IonLabel>
        {badge ? <IonBadge slot="end">{badge}</IonBadge> : null}
      </IonItem>
    </IonMenuToggle>
  );

  const about = () =>
    presentAlert({
      header: 'Budgy',
      subHeader: `v${version}`,
      message: t(user ? 'settings.aboutSynced' : 'settings.about'),
      buttons: [t('common.close')],
    });

  return (
    <IonMenu contentId={MENU_CONTENT_ID} type="overlay" className="b-menu">
      <IonContent>
        <div className="b-menu__head">
          <ProfileAvatar size={52} />
          <div style={{ minWidth: 0 }}>
            <strong>{profileName.trim() || 'Budgy'}</strong>
            <small>
              <IonIcon icon={cloudOutline} />
              {backupLabel}
            </small>
          </div>
        </div>
        <IonList lines="none" className="b-menu__list">
          {page('/profile', personCircleOutline, t('menu.profile'))}
          {page('/settings', settingsOutline, t('menu.settings'))}
          {page('/data', serverOutline, t('menu.data'))}
          {showBankTexts && page('/sms', chatboxEllipsesOutline, t('menu.bankTexts'), pending)}
          <IonMenuToggle autoHide={false}>
            <IonItem button detail={false} lines="none" href={PLAY_STORE_URL} target="_blank" rel="noopener">
              <IonIcon icon={starOutline} slot="start" />
              <IonLabel>{t('menu.rate')}</IonLabel>
            </IonItem>
            <IonItem button detail={false} lines="none" href={`mailto:${SUPPORT_EMAIL}?subject=Budgy`}>
              <IonIcon icon={headsetOutline} slot="start" />
              <IonLabel>{t('menu.support')}</IonLabel>
            </IonItem>
            <IonItem button detail={false} lines="none" onClick={about}>
              <IonIcon icon={informationCircleOutline} slot="start" />
              <IonLabel>{t('menu.about')}</IonLabel>
            </IonItem>
          </IonMenuToggle>
        </IonList>
      </IonContent>
    </IonMenu>
  );
}
