import { useIonAlert, useIonToast } from '@ionic/react';
import { useTranslation } from 'react-i18next';
import { useAccountFilter } from '@/core/contexts/AccountFilterContext';
import { useSettings } from '@/core/contexts/SettingsContext';
import { useCloud } from '@/core/cloud/CloudContext';
import { alive, db, eraseAll, exportBackup, importBackup } from '@/core/db/db';
import { useNames } from '@/core/db/hooks';
import { pickTextFile, saveTextFile, toCsv } from '@/core/utils/files';
import { dayKey } from '@/core/utils/period';

/** Export, backup, restore and erase — used by the Data page and the Profile page's "Back up now". */
export function useDataActions() {
  const { t } = useTranslation();
  const settings = useSettings();
  const { update } = settings;
  const { reset: resetFilter } = useAccountFilter();
  // Signed in, a restore or erase also replaces the data in the account (on every device).
  const { user, localReplaced } = useCloud();
  const { accountName, categoryName } = useNames();
  const [presentAlert] = useIonAlert();
  const [presentToast] = useIonToast();

  const toast = (message: string, color = 'success') => presentToast({ message, duration: 2000, position: 'top', color });
  const stamp = () => dayKey(new Date());

  const exportCsv = async () => {
    try {
      const [txs, accounts, categories] = await Promise.all([db.transactions.orderBy('date').filter(alive).toArray(), db.accounts.toArray(), db.categories.toArray()]);
      const accMap = new Map(accounts.map((a) => [a.id, a]));
      const catMap = new Map(categories.map((c) => [c.id, c]));
      const rows: (string | number)[][] = [
        ['Date', 'Type', 'Amount', 'Currency', 'Account', 'To account', 'Category', 'Note', 'Received', 'Received currency'],
      ];
      for (const x of txs) {
        rows.push([
          // Local day, as shown in the app; the stored ISO string is UTC.
          dayKey(new Date(x.date)),
          x.type,
          x.amount,
          x.currency,
          accountName(accMap.get(x.accountId)),
          x.toAccountId != null ? accountName(accMap.get(x.toAccountId)) : '',
          x.categoryId != null ? categoryName(catMap.get(x.categoryId)) : '',
          x.note ?? '',
          x.toAmount ?? '',
          x.toCurrency ?? '',
        ]);
      }
      await saveTextFile(`budgy-transactions-${stamp()}.csv`, toCsv(rows), 'text/csv');
    } catch {
      toast(t('settings.exportFailed'), 'danger');
    }
  };

  const backup = async () => {
    try {
      const data = await exportBackup(settings);
      // Only count it as a backup if the file actually went somewhere.
      if (await saveTextFile(`budgy-backup-${stamp()}.json`, JSON.stringify(data), 'application/json')) {
        update({ lastBackupAt: new Date().toISOString() });
      }
    } catch {
      toast(t('settings.exportFailed'), 'danger');
    }
  };

  const restore = () =>
    presentAlert({
      header: t('settings.restoreTitle'),
      message: t(user ? 'settings.restoreMessageSynced' : 'settings.restoreMessage'),
      buttons: [
        { text: t('common.cancel'), role: 'cancel' },
        {
          text: t('settings.chooseFile'),
          handler: async () => {
            const text = await pickTextFile();
            if (!text) return;
            try {
              update(await importBackup(JSON.parse(text)));
              resetFilter();
              localReplaced();
              toast(t('settings.restored'));
            } catch {
              toast(t('settings.invalidBackup'), 'danger');
            }
          },
        },
      ],
    });

  const erase = () =>
    presentAlert({
      header: t('settings.eraseTitle'),
      message: t(user ? 'settings.eraseMessageSynced' : 'settings.eraseMessage'),
      buttons: [
        { text: t('common.cancel'), role: 'cancel' },
        {
          text: t('settings.eraseConfirm'),
          role: 'destructive',
          handler: async () => {
            await eraseAll();
            resetFilter();
            localReplaced();
            toast(t('settings.erased'));
          },
        },
      ],
    });

  return { exportCsv, backup, restore, erase };
}
