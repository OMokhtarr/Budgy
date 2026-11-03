import { IonIcon, useIonActionSheet } from '@ionic/react';
import { chevronBackOutline, chevronForwardOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { usePeriod } from '@/core/contexts/PeriodContext';
import { useLocale } from '@/core/contexts/SettingsContext';
import { addDays, isSameDay } from '@/core/utils/period';
import type { PeriodMode } from '@/shared/models';

const MODES: PeriodMode[] = ['day', 'week', 'month', 'year', 'all'];

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
    case 'week': {
      const last = addDays(range.end, -1);
      return `${fmt({ day: 'numeric', month: 'short' }, range.start)} – ${fmt({ day: 'numeric', month: 'short' }, last)}`;
    }
    case 'month':
      return fmt({ month: 'long', year: 'numeric' }, anchor);
    case 'year':
      return fmt({ year: 'numeric' }, anchor);
    default:
      return t('period.allTime');
  }
}

/** ‹  November 2026  › — tap the label to change Day / Week / Month / Year / All. */
export default function PeriodBar() {
  const { t } = useTranslation();
  const { mode, setMode, prev, next } = usePeriod();
  const label = usePeriodLabel();
  const [present] = useIonActionSheet();

  const choose = () =>
    present({
      header: t('period.choose'),
      buttons: [
        ...MODES.map((m) => ({
          text: t(`period.${m}`) + (m === mode ? '  ✓' : ''),
          handler: () => setMode(m),
        })),
        { text: t('common.cancel'), role: 'cancel' },
      ],
    });

  return (
    <div className="b-period">
      <button className="b-iconbtn" onClick={prev} disabled={mode === 'all'} aria-label={t('period.previous')}>
        <IonIcon icon={chevronBackOutline} className="b-flip" />
      </button>
      <button className="b-period__label" onClick={choose}>
        <small>{t(`period.${mode}`)}</small>
        {label}
      </button>
      <button className="b-iconbtn" onClick={next} disabled={mode === 'all'} aria-label={t('period.next')}>
        <IonIcon icon={chevronForwardOutline} className="b-flip" />
      </button>
    </div>
  );
}
