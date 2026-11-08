import { useCallback } from 'react';
import { useIonAlert } from '@ionic/react';
import { useTranslation } from 'react-i18next';
import { findManualDuplicate } from './duplicate';

/** "Keep both", "Skip", or the alert closed without a choice (save nothing, change nothing). */
export type DuplicateChoice = 'keep' | 'skip' | 'cancel';

/**
 * Resolves 'keep' when there's no duplicate or the user keeps both, 'skip' when they skip, and 'cancel'
 * when they close the alert without choosing.
 */
export function useDuplicatePrompt(): (d: Parameters<typeof findManualDuplicate>[0]) => Promise<DuplicateChoice> {
  const { t } = useTranslation();
  const [presentAlert] = useIonAlert();

  return useCallback(
    async (d) => {
      if (!(await findManualDuplicate(d))) return 'keep';
      return new Promise<DuplicateChoice>((resolve) => {
        presentAlert({
          header: t('sms.duplicateTitle'),
          message: t('sms.duplicateBody'),
          buttons: [
            { text: t('sms.skip'), role: 'skip' },
            { text: t('sms.keepBoth'), role: 'keep' },
          ],
          onDidDismiss: (e) => resolve(e.detail.role === 'keep' || e.detail.role === 'skip' ? e.detail.role : 'cancel'),
        }).catch(() => resolve('cancel'));
      });
    },
    [presentAlert, t],
  );
}
