import { useState } from 'react';
import { IonIcon } from '@ionic/react';
import { chevronDownOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { usePeriod } from '@/core/contexts/PeriodContext';
import { useLocale } from '@/core/contexts/SettingsContext';
import { addDays, daysIn, formatRange, isSameDay } from '@/core/utils/period';
import { doubleChevronBack, doubleChevronForward } from '@/shared/icons';
import PeriodSheet from './PeriodSheet';

export function usePeriodLabel(): string {
  const { t } = useTranslation();
  const locale = useLocale();
  const { mode, range, anchor } = usePeriod();
  const fmt = (o: Intl.DateTimeFormatOptions, d: Date) => new Intl.DateTimeFormat(locale, o).format(d);
  switch (mode) {
    case 'day': {
      const today = new Date();
      if (isSameDay(anchor, today)) return t('period.today');
      if (isSameDay(anchor, addDays(today, -1))) return t('period.yesterday');
      return fmt({ weekday: 'short', day: 'numeric', month: 'long' }, anchor);
    }
    case 'week':
      return formatRange(range, locale, { day: 'numeric', month: 'short' });
    case 'range':
      return formatRange(range, locale, { day: 'numeric', month: 'short', year: 'numeric' });
    case 'month':
      return fmt({ month: 'long', year: 'numeric' }, anchor);
    case 'year':
      return fmt({ year: 'numeric' }, anchor);
    default:
      return t('period.allTime');
  }
}

/** «  [30] NOVEMBER 2026 ⌄  » — tap the pill to choose another period. */
export default function PeriodBar() {
  const { t } = useTranslation();
  const { mode, range, prev, next } = usePeriod();
  const label = usePeriodLabel();
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="b-period">
      <button className="b-period__nav" onClick={prev} disabled={mode === 'all'} aria-label={t('period.previous')}>
        <IonIcon icon={doubleChevronBack} className="b-flip" />
      </button>
      <button className="b-period__label" onClick={() => setSheetOpen(true)} aria-label={`${t('period.choose')}: ${label}`}>
        <span className="b-period__days">{mode === 'all' ? '∞' : daysIn(range)}</span>
        {label}
        <IonIcon icon={chevronDownOutline} />
      </button>
      <button className="b-period__nav" onClick={next} disabled={mode === 'all'} aria-label={t('period.next')}>
        <IonIcon icon={doubleChevronForward} className="b-flip" />
      </button>
      <PeriodSheet isOpen={sheetOpen} label={label} onClose={() => setSheetOpen(false)} />
    </div>
  );
}
