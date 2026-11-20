import { IonButton } from '@ionic/react';
import { useTranslation } from 'react-i18next';
import type { LockView } from './lockController';

/** Hides the whole app while Budgy is away (logo only) or locked (with Unlock). */
export default function LockCover({ view, onUnlock }: { view: LockView; onUnlock: () => void }) {
  const { t } = useTranslation();
  if (view === 'open') return null;
  return (
    <div className="b-lock-cover" role="dialog" aria-modal="true" aria-label={t('lock.locked')}>
      <img className="b-lock-cover__logo" src="/icon.png" alt="" />
      {view === 'locked' && (
        <>
          <div className="b-lock-cover__title">{t('lock.locked')}</div>
          <IonButton shape="round" onClick={onUnlock}>
            {t('lock.unlock')}
          </IonButton>
        </>
      )}
    </div>
  );
}
