import { useIonActionSheet, useIonAlert } from '@ionic/react';
import { useTranslation } from 'react-i18next';
import { useMoney } from '@/core/contexts/SettingsContext';
import { useLookups, useNames } from '@/core/db/hooks';
import { instalmentPlans, type InstalmentPlan } from '@/core/utils/creditCard';
import Avatar from '@/shared/components/Avatar';
import MoneyText from '@/shared/components/MoneyText';
import type { Account, Transaction } from '@/shared/models';
import { deletePlan, payOffPlan } from './instalments';

/** A credit card's running instalment plans; tapping one offers to pay off the rest or delete it. */
export default function InstalmentsBlock({ account, txs, onAddFee }: { account: Account; txs: Transaction[]; onAddFee: () => void }) {
  const { t } = useTranslation();
  const money = useMoney();
  const { categories } = useLookups();
  const { categoryName } = useNames();
  const [presentSheet] = useIonActionSheet();
  const [presentAlert] = useIonAlert();
  const plans = instalmentPlans(account.id!, txs, new Date());
  if (!plans.length) return null;

  const nameOf = (p: InstalmentPlan) => p.first.note || categoryName(categories.get(p.first.categoryId!));
  const payOff = (p: InstalmentPlan) =>
    presentAlert({
      header: t('instalments.payOff'),
      message: t('instalments.payOffConfirm', { amount: money.format(p.toCome, p.currency) }),
      buttons: [
        { text: t('common.cancel'), role: 'cancel' },
        { text: t('instalments.payOffAndFee'), handler: () => void payOffPlan(p.planId, new Date()).then(onAddFee) },
        { text: t('instalments.payOff'), handler: () => void payOffPlan(p.planId, new Date()) },
      ],
    });
  const remove = (p: InstalmentPlan) =>
    presentAlert({
      header: t('instalments.delete'),
      message: t('instalments.deleteConfirm', { count: p.of }),
      buttons: [
        { text: t('common.cancel'), role: 'cancel' },
        { text: t('common.delete'), role: 'destructive', handler: () => void deletePlan(p.planId) },
      ],
    });
  const open = (p: InstalmentPlan) =>
    presentSheet({
      header: nameOf(p),
      buttons: [
        // `void`: the menu waits on what a handler returns, and the confirmation's promise must not hold it open.
        { text: t('instalments.payOff'), handler: () => void payOff(p) },
        { text: t('instalments.delete'), role: 'destructive', handler: () => void remove(p) },
        { text: t('common.cancel'), role: 'cancel' },
      ],
    });

  return (
    <>
      <div className="b-section-title">{t('instalments.blockTitle')}</div>
      <div className="b-card b-rlist">
        {plans.map((p) => {
          const cat = categories.get(p.first.categoryId!);
          return (
            <button key={p.planId} className="b-row" onClick={() => open(p)}>
              <Avatar icon={cat?.icon ?? 'other'} color={cat?.color ?? '#64748b'} />
              <div className="b-row__main">
                <div className="b-row__title">{nameOf(p)}</div>
                <div className="b-row__sub">
                  <span>{t('instalments.progress', { charged: p.charged, of: p.of, amount: money.format(p.toCome, p.currency) })}</span>
                </div>
              </div>
              <div className="b-row__amount b-num">
                <MoneyText currency={p.currency} text={money.plain(p.monthly, p.currency)} />
                <small>{t('instalments.aMonth')}</small>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}
