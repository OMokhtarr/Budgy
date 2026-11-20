import { IonIcon } from '@ionic/react';
import { chevronForwardOutline, repeatOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { useLocale } from '@/core/contexts/SettingsContext';
import { dayKey, parseDayKey } from '@/core/utils/period';
import { useDue, useRecurringLabel } from './hooks';
import { useOpenRecurring } from './useOpenRecurring';

/** A line for each recurring transaction waiting to be added; tapping one opens the oldest that's due. */
export default function RecurringReminders() {
  const { t } = useTranslation();
  const locale = useLocale();
  const due = useDue();
  const label = useRecurringLabel();
  const { openDue } = useOpenRecurring();
  if (!due?.length) return null;
  const today = dayKey(new Date());

  return (
    <div className="b-remind">
      {due.map(({ r, days }) => {
        const vars = { ...label(r), count: days.length };
        const first = days[0];
        const text =
          days.length > 1 ? t('recurring.remindMany', vars)
          : first === today ? t('recurring.remindToday', vars)
          : t('recurring.remindWas', { ...vars, date: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(parseDayKey(first)) });
        return (
          <button key={r.id} className="b-remind__item" onClick={() => openDue(r, first)}>
            <IonIcon icon={repeatOutline} />
            <span>{text}</span>
            <IonIcon icon={chevronForwardOutline} className="b-remind__go b-flip" />
          </button>
        );
      })}
    </div>
  );
}
