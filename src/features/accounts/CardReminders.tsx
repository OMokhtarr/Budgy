import { IonIcon } from '@ionic/react';
import { alarmOutline, chevronForwardOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { useMoney } from '@/core/contexts/SettingsContext';
import { useAccounts, useCardStatuses, useNames } from '@/core/db/hooks';
import { needsReminder } from '@/core/utils/creditCard';
import type { Account } from '@/shared/models';

/** A line for each credit card that's overdue or due soon; tapping one opens the card. */
export default function CardReminders({ onOpen }: { onOpen: (a: Account) => void }) {
  const { t } = useTranslation();
  const money = useMoney();
  const { accountName } = useNames();
  const accounts = useAccounts();
  const statuses = useCardStatuses();
  const due = (accounts ?? []).flatMap((a) => {
    const s = statuses?.get(a.id!);
    return s && needsReminder(s) ? [{ a, s }] : [];
  });
  if (!due.length) return null;

  return (
    <div className="b-remind">
      {due.map(({ a, s }) => {
        const amounts = Object.entries(s.byCurrency).filter(([, x]) => x.due > 0);
        const amount = amounts.map(([c, x]) => money.format(x.due, c)).join(' + ');
        const vars = { name: accountName(a), amount, count: Math.abs(s.daysLeft) };
        const text =
          s.state === 'overdue' ? t('cards.remindOverdue', vars)
          : s.daysLeft === 0 ? t('cards.remindToday', vars)
          : t('cards.remindDue', vars);
        return (
          <button key={a.id} className={`b-remind__item ${s.state === 'overdue' ? 'is-overdue' : ''}`} onClick={() => onOpen(a)}>
            <IonIcon icon={alarmOutline} />
            <span>{text}</span>
            <IonIcon icon={chevronForwardOutline} className="b-remind__go b-flip" />
          </button>
        );
      })}
    </div>
  );
}
