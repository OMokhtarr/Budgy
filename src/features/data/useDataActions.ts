import { useIonAlert, useIonToast } from '@ionic/react';
import { useTranslation } from 'react-i18next';
import { useAccountFilter } from '@/core/contexts/AccountFilterContext';
import { useSettings } from '@/core/contexts/SettingsContext';
import { useCloud } from '@/core/cloud/CloudContext';
import { alive, db, eraseAll, exportBackup, importBackup } from '@/core/db/db';
import { useNames } from '@/core/db/hooks';
import { csvRows, hasUnused, planCsvImport, saveCsvImport, type CsvPlan } from '@/core/db/transactionsCsv';
import { pickTextFile, saveTextFile, toCsv } from '@/core/utils/files';
import { dayKey } from '@/core/utils/period';

/** Export, import, backup, restore and erase — used by the Data page and the Profile page's "Back up now". */
export function useDataActions() {
  const { t, i18n } = useTranslation();
  const settings = useSettings();
  const { update, forgetLastScan } = settings;
  const { reset: resetFilter } = useAccountFilter();
  // Signed in, a restore or erase also replaces the data in the account (on every device).
  const { user, replaceLocal } = useCloud();
  const { accountName, categoryName } = useNames();
  const [presentAlert] = useIonAlert();
  const [presentToast] = useIonToast();

  const toast = (message: string, color = 'success') => presentToast({ message, duration: 2000, position: 'top', color });
  const stamp = () => dayKey(new Date());

  const exportCsv = async () => {
    try {
      const [txs, accounts, categories] = await Promise.all([db.transactions.orderBy('date').filter(alive).toArray(), db.accounts.toArray(), db.categories.toArray()]);
      await saveTextFile(`budgy-transactions-${stamp()}.csv`, toCsv(csvRows(txs, accounts, categories, { accountName, categoryName })), 'text/csv');
    } catch {
      toast(t('settings.exportFailed'), 'danger');
    }
  };

  const importSummary = (plan: CsvPlan) =>
    [
      t('settings.importAdd', { n: plan.transactions.length }),
      plan.duplicates && t('settings.importDuplicates', { n: plan.duplicates }),
      plan.newAccounts.length && t('settings.importNewAccounts', { n: plan.newAccounts.length }),
      plan.newCategories.length && t('settings.importNewCategories', { n: plan.newCategories.length }),
      plan.unusedCategories.length && t('settings.importUnusedCategories', { n: plan.unusedCategories.length }),
      plan.unusedSubcategories.length && t('settings.importUnusedSubcategories', { n: plan.unusedSubcategories.reduce((n, x) => n + x.ids.length, 0) }),
      plan.badRows.length && t('settings.importBadRows', { n: plan.badRows.length, row: plan.badRows[0] }),
    ]
      .filter(Boolean)
      .join(' · ');

  const importCsv = async () => {
    const text = await pickTextFile('.csv,text/csv,text/comma-separated-values');
    if (!text) return;
    try {
      const [accounts, categories, transactions] = await Promise.all([db.accounts.toArray(), db.categories.toArray(), db.transactions.toArray()]);
      // Built-in accounts and categories appear in a file in whichever language it was exported.
      const labelsOf = (key: string) => ['en', 'ar'].map((lng) => i18n.t(key, { lng }));
      const plan = planCsvImport(text, { accounts, categories, transactions }, labelsOf);
      if (!plan) {
        toast(t('settings.invalidCsv'), 'danger');
        return;
      }
      const unused = hasUnused(plan);
      if (!plan.transactions.length && !unused) {
        toast(`${t('settings.importNothing')} · ${importSummary(plan)}`, plan.badRows.length ? 'danger' : 'success');
        return;
      }
      presentAlert({
        header: t('settings.importTitle'),
        message: importSummary(plan),
        inputs: unused ? [{ type: 'checkbox', label: t('settings.importRemoveUnused'), value: 'removeUnused', checked: true }] : [],
        buttons: [
          { text: t('common.cancel'), role: 'cancel' },
          {
            text: t('settings.importConfirm'),
            handler: async (checked?: string[]) => {
              const removeUnused = unused && !!checked?.includes('removeUnused');
              try {
                await saveCsvImport(plan, { removeUnused });
                toast(
                  [
                    plan.transactions.length ? t('settings.imported', { n: plan.transactions.length }) : t('settings.importNothing'),
                    removeUnused && t('settings.removedUnused'),
                  ]
                    .filter(Boolean)
                    .join(' · '),
                );
              } catch {
                toast(t('settings.importFailed'), 'danger');
              }
            },
          },
        ],
      });
    } catch {
      toast(t('settings.importFailed'), 'danger');
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
              update(await replaceLocal(() => importBackup(JSON.parse(text))));
              resetFilter();
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
            await replaceLocal(eraseAll);
            // The bank texts were erased too; a restore keeps them, and with them the last scan.
            forgetLastScan();
            resetFilter();
            toast(t('settings.erased'));
          },
        },
      ],
    });

  return { exportCsv, importCsv, backup, restore, erase };
}
