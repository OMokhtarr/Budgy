import { IonItem, IonLabel, IonList, IonListHeader, useIonToast } from '@ionic/react';
import { useTranslation } from 'react-i18next';
import { useTours } from './TourProvider';

/** Settings section to replay the welcome slides, the page tips and the latest "What's new". */
export default function ToursSettingsSection() {
  const { t } = useTranslation();
  const [presentToast] = useIonToast();
  const { showWelcome, resetTours, showWhatsNew, hasReleases } = useTours();

  const replayTips = () => {
    resetTours();
    presentToast({ message: t('onboarding.settings.replayToast'), duration: 2200, position: 'top', color: 'medium' });
  };

  return (
    <IonList inset>
      <IonListHeader>{t('onboarding.settings.title')}</IonListHeader>
      <IonItem button detail={false} onClick={showWelcome}>
        <IonLabel>{t('onboarding.settings.welcome')}</IonLabel>
      </IonItem>
      <IonItem button detail={false} lines={hasReleases ? 'inset' : 'none'} onClick={replayTips}>
        <IonLabel>{t('onboarding.settings.replay')}</IonLabel>
      </IonItem>
      {hasReleases && (
        <IonItem button detail={false} lines="none" onClick={showWhatsNew}>
          <IonLabel>{t('onboarding.settings.whatsNew')}</IonLabel>
        </IonItem>
      )}
    </IonList>
  );
}
