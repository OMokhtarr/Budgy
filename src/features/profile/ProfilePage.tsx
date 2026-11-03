import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonPage, IonTitle, IonToolbar } from '@ionic/react';
import { cloudOutline, cloudUploadOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { useLocale, useSettings } from '@/core/contexts/SettingsContext';
import { dayTimeLabel } from '@/core/utils/period';
import { useDataActions } from '@/features/data/useDataActions';
import { COLORS } from '@/shared/icons';
import ProfileAvatar from '@/shared/components/ProfileAvatar';
import AccountSyncSection from './AccountSyncSection';

export default function ProfilePage() {
  const { t } = useTranslation();
  const locale = useLocale();
  const { profileName, profileColor, lastBackupAt, update } = useSettings();
  const { backup } = useDataActions();

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar className="b-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/categories" text="" />
          </IonButtons>
          <IonTitle className="b-title">{t('menu.profile')}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <div className="b-page" style={{ paddingTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <ProfileAvatar size={88} />
          </div>

          <label className="b-field">
            <span>{t('profile.name')}</span>
            <input
              className="b-input"
              value={profileName}
              maxLength={30}
              placeholder={t('profile.namePlaceholder')}
              onChange={(e) => update({ profileName: e.target.value })}
            />
          </label>

          <div className="b-field">
            <span>{t('profile.color')}</span>
            <div className="b-swatches">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`b-swatch ${c === profileColor ? 'is-selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => update({ profileColor: c })}
                  aria-label={c}
                />
              ))}
            </div>
          </div>

          <AccountSyncSection />

          <div className="b-section-title">{t('profile.backup')}</div>
          <div className="b-card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <IonIcon icon={cloudOutline} style={{ fontSize: 26, color: 'var(--b-muted)' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>
                {lastBackupAt
                  ? t('profile.lastBackup', {
                      when: dayTimeLabel(new Date(lastBackupAt), locale, { today: t('period.today'), yesterday: t('period.yesterday') }),
                    })
                  : t('profile.never')}
              </div>
              <div className="b-muted" style={{ fontSize: 12.5 }}>{t('profile.backupHint')}</div>
            </div>
          </div>
          <button className="b-btn b-btn--primary" style={{ width: '100%', marginTop: 12 }} onClick={backup}>
            <IonIcon icon={cloudUploadOutline} />
            {t('profile.backupNow')}
          </button>
        </div>
      </IonContent>
    </IonPage>
  );
}
