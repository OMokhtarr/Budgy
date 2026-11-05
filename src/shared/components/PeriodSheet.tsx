import { useState } from 'react';
import { IonDatetime, IonIcon, IonModal } from '@ionic/react';
import { calendarOutline, infiniteOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { usePeriod } from '@/core/contexts/PeriodContext';
import { useLocale, useSettings } from '@/core/contexts/SettingsContext';
import { addDays, dayKey, formatRange, parseDayKey, rangeFor, setRangeDay, type RangeDraft } from '@/core/utils/period';
import type { DateRange } from '@/shared/models';

interface TileProps {
  /** A small number in a box, like a calendar page... */
  num?: string;
  /** ...or an icon. */
  icon?: string;
  title: string;
  sub?: string;
  wide?: boolean;
  onClick: () => void;
}

function Tile({ num, icon, title, sub, wide, onClick }: TileProps) {
  return (
    <button className={`b-periodtile ${wide ? 'b-periodtile--wide is-active' : ''}`} onClick={onClick}>
      {num && <span className="b-periodtile__num">{num}</span>}
      {icon && <IonIcon icon={icon} />}
      <span>{title}</span>
      {sub && <small>{sub}</small>}
    </button>
  );
}

/** Lives inside its modal, so it starts again from `initial` each time the modal opens. */
function RangeForm({ initial, onCancel, onDone }: { initial: DateRange; onCancel: () => void; onDone: (first: Date, last: Date) => void }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const [draft, setDraft] = useState<RangeDraft>({ from: dayKey(initial.start), to: dayKey(addDays(initial.end, -1)) });
  const [side, setSide] = useState<keyof RangeDraft>('from');

  const dateLabel = (key: string) =>
    new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(parseDayKey(key));

  return (
    <div className="b-rangepick">
      <div className="b-rangepick__sides">
        {(['from', 'to'] as const).map((s) => (
          <button key={s} className={side === s ? 'is-active' : ''} aria-pressed={side === s} onClick={() => setSide(s)}>
            <small>{t(`period.${s}`)}</small>
            {dateLabel(draft[s])}
          </button>
        ))}
      </div>
      <IonDatetime
        presentation="date"
        locale={locale}
        value={draft[side]}
        highlightedDates={(iso) =>
          iso >= draft.from && iso <= draft.to
            ? { backgroundColor: 'rgba(var(--ion-color-primary-rgb), 0.18)', textColor: 'var(--b-text)' }
            : undefined
        }
        onIonChange={(e) => {
          const v = e.detail.value;
          if (typeof v !== 'string') return;
          setDraft((d) => setRangeDay(d, side, v.slice(0, 10)));
          setSide('to');
        }}
      />
      <div className="b-rangepick__foot">
        <button className="b-btn b-btn--muted" onClick={onCancel}>{t('common.cancel')}</button>
        <button className="b-btn b-btn--primary" onClick={() => onDone(parseDayKey(draft.from), parseDayKey(draft.to))}>
          {t('common.done')}
        </button>
      </div>
    </div>
  );
}

/** Bottom sheet for choosing the period. `label` is the period showing now. */
export default function PeriodSheet({ isOpen, label, onClose }: { isOpen: boolean; label: string; onClose: () => void }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { weekStart } = useSettings();
  const { mode, anchor, range, setMode, pickDay, pickRange } = usePeriod();
  const [picker, setPicker] = useState<'day' | 'range' | null>(null);

  const now = new Date();
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, o).format(now);
  const finish = () => {
    setPicker(null);
    onClose();
  };
  const show = (m: Parameters<typeof setMode>[0]) => {
    setMode(m);
    finish();
  };

  return (
    <>
      <IonModal className="b-sheet-modal" isOpen={isOpen} breakpoints={[0, 1]} initialBreakpoint={1} handle={false} onDidDismiss={onClose}>
        <div className="b-sheet">
          <h2 className="b-period__sheet-title">{t('period.choose')}</h2>
          <div className="b-periodgrid">
            <Tile wide num="31" title={t('period.selectRange')} sub={label} onClick={() => setPicker('range')} />
            <Tile icon={infiniteOutline} title={t('period.all')} onClick={() => show('all')} />
            <Tile icon={calendarOutline} title={t('period.selectDay')} onClick={() => setPicker('day')} />
            <Tile
              num="7"
              title={t('period.week')}
              sub={formatRange(rangeFor('week', now, weekStart), locale, { day: 'numeric', month: 'short' })}
              onClick={() => show('week')}
            />
            <Tile num="1" title={t('period.today')} sub={fmt({ day: 'numeric', month: 'long' })} onClick={() => show('day')} />
            <Tile num="365" title={t('period.year')} sub={`${t('period.year')} ${fmt({ year: 'numeric' })}`} onClick={() => show('year')} />
            <Tile num="30" title={t('period.month')} sub={fmt({ month: 'long', year: 'numeric' })} onClick={() => show('month')} />
          </div>
        </div>
      </IonModal>

      <IonModal className="b-date-modal" isOpen={picker === 'day'} onDidDismiss={() => setPicker((p) => (p === 'day' ? null : p))}>
        <IonDatetime
          presentation="date"
          locale={locale}
          value={dayKey(mode === 'range' ? range.start : anchor)}
          onIonChange={(e) => {
            const v = e.detail.value;
            if (typeof v !== 'string') return;
            pickDay(parseDayKey(v.slice(0, 10)));
            finish();
          }}
        />
      </IonModal>

      <IonModal className="b-date-modal" isOpen={picker === 'range'} onDidDismiss={() => setPicker((p) => (p === 'range' ? null : p))}>
        <RangeForm
          // All time reaches back to 1970, so start from the month in view instead.
          initial={mode === 'all' ? rangeFor('month', anchor) : range}
          onCancel={() => setPicker(null)}
          onDone={(first, last) => {
            pickRange(first, last);
            finish();
          }}
        />
      </IonModal>
    </>
  );
}
