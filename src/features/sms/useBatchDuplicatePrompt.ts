import { useCallback } from 'react';
import { useIonAlert } from '@ionic/react';
import { useTranslation } from 'react-i18next';
import type { DuplicateChoice } from './useDuplicatePrompt';

/**
 * One question for several texts that look already added: skip those, keep all, or (closing the alert) save
 * nothing. Resolves 'skip', 'keep' or 'cancel'.
 */
export function useBatchDuplicatePrompt(): (count: number) => Promise<DuplicateChoice> {
  const { t } = useTranslation();
  const [presentAlert] = useIonAlert();

  return useCallback(
    (count) =>
      new Promise<DuplicateChoice>((resolve) => {
        presentAlert({
          header: t('sms.batchDuplicateTitle'),
          message: t('sms.batchDuplicateBody', { count }),
          buttons: [
            { text: t('sms.skipThose'), role: 'skip' },
            { text: t('sms.keepAll'), role: 'keep' },
          ],
          onDidDismiss: (e) => resolve(e.detail.role === 'keep' || e.detail.role === 'skip' ? e.detail.role : 'cancel'),
        }).catch(() => resolve('cancel'));
      }),
    [presentAlert, t],
  );
}
