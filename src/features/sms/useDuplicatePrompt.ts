import { useCallback } from 'react';
import { useIonAlert } from '@ionic/react';
import { useTranslation } from 'react-i18next';
import { db } from '@/core/db/db';
import { useNames } from '@/core/db/hooks';
import { findDuplicate, type DupeQuery, type Duplicate } from './duplicate';

/** "Keep both", "Skip", or the alert closed without a choice (save nothing, change nothing). */
export type DuplicateChoice = 'keep' | 'skip' | 'cancel';

/** The user's answer, with what the text matched (for "Skip" to link a text to the instalment it is). */
export interface DuplicateAnswer {
  choice: DuplicateChoice;
  match?: Duplicate;
}

/**
 * Resolves 'keep' when there's no duplicate or the user keeps both, 'skip' when they skip, and 'cancel'
 * when they close the alert without choosing. A text that matches a planned instalment is asked about by name.
 */
export function useDuplicatePrompt(): (d: DupeQuery) => Promise<DuplicateAnswer> {
  const { t } = useTranslation();
  const { categoryName } = useNames();
  const [presentAlert] = useIonAlert();

  return useCallback(
    async (d) => {
      const match = await findDuplicate(d);
      if (!match) return { choice: 'keep' };
      const instalment = match.kind === 'instalment' ? match.tx.instalment : undefined;
      const name = instalment
        ? match.tx.note?.trim() || categoryName(match.tx.categoryId ? await db.categories.get(match.tx.categoryId) : undefined)
        : '';
      return new Promise<DuplicateAnswer>((resolve) => {
        presentAlert({
          header: t(instalment ? 'sms.instalmentMatchTitle' : 'sms.duplicateTitle'),
          message: instalment ? t('sms.instalmentMatchBody', { name, n: instalment.n, of: instalment.of }) : t('sms.duplicateBody'),
          buttons: [
            { text: t(instalment ? 'sms.alreadyRecorded' : 'sms.skip'), role: 'skip' },
            { text: t(instalment ? 'sms.addAnyway' : 'sms.keepBoth'), role: 'keep' },
          ],
          onDidDismiss: (e) => {
            const role = e.detail.role;
            resolve({ choice: role === 'keep' || role === 'skip' ? role : 'cancel', match });
          },
        }).catch(() => resolve({ choice: 'cancel', match }));
      });
    },
    [presentAlert, t, categoryName],
  );
}
