import {
  IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonPage, IonTitle, IonToolbar,
} from '@ionic/react';
import { cloudDownloadOutline, cloudUploadOutline, documentAttachOutline, documentTextOutline, trashOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { useDataActions } from './useDataActions';
import { useCloud } from '@/core/cloud/CloudContext';

export default function DataPage() {
  const { t } = useTranslation();
  const { exportCsv, importCsv, backup, restore, erase } = useDataActions();
  const { user } = useCloud();

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar className="b-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/categories" text="" />
          </IonButtons>
          <IonTitle className="b-title">{t('menu.data')}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <div className="b-page" style={{ paddingInline: 0 }}>
          <IonList inset>
            <IonItem button detail={false} onClick={exportCsv}>
              <IonIcon icon={documentTextOutline} slot="start" color="primary" />
              <IonLabel>
                {t('settings.exportCsv')}
                <p>{t('settings.exportCsvHint')}</p>
              </IonLabel>
            </IonItem>
            <IonItem button detail={false} onClick={importCsv}>
              <IonIcon icon={documentAttachOutline} slot="start" color="primary" />
              <IonLabel>
                {t('settings.importCsv')}
                <p>{t('settings.importCsvHint')}</p>
              </IonLabel>
            </IonItem>
            <IonItem button detail={false} onClick={backup}>
              <IonIcon icon={cloudUploadOutline} slot="start" color="primary" />
              <IonLabel>
                {t('settings.backup')}
                <p>{t('settings.backupHint')}</p>
              </IonLabel>
            </IonItem>
            <IonItem button detail={false} onClick={restore}>
              <IonIcon icon={cloudDownloadOutline} slot="start" color="primary" />
              <IonLabel>
                {t('settings.restore')}
                <p>{t('settings.restoreHint')}</p>
              </IonLabel>
            </IonItem>
            <IonItem button detail={false} onClick={erase}>
              <IonIcon icon={trashOutline} slot="start" color="danger" />
              <IonLabel color="danger">{t('settings.erase')}</IonLabel>
            </IonItem>
          </IonList>
          <p className="b-muted b-hint" style={{ paddingInline: 20 }}>{t(user ? 'settings.aboutSynced' : 'settings.about')}</p>
        </div>
      </IonContent>
    </IonPage>
  );
}
