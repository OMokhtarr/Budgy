import { useMemo, type CSSProperties } from 'react';
import { CURRENCIES, useLocale } from '@/core/contexts/SettingsContext';

/** The currency chip grid: the chosen currency first, then the rest in the usual order. */
export default function CurrencyChips({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const locale = useLocale();

  const names = useMemo(() => {
    try {
      const dn = new Intl.DisplayNames([locale], { type: 'currency' });
      return (c: string) => dn.of(c) ?? c;
    } catch {
      return (c: string) => c;
    }
  }, [locale]);

  const list = [value, ...CURRENCIES.filter((c) => c !== value)];

  return (
    <div className="b-chipgrid">
      {list.map((c) => (
        <button
          key={c}
          className={`b-acchip ${c === value ? 'is-on' : ''}`}
          style={{ '--c': 'var(--ion-color-primary)' } as CSSProperties}
          onClick={() => onChange(c)}
          aria-pressed={c === value}
        >
          <span className="b-acchip__text">
            <strong>{c}</strong>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.8, fontSize: 12.5 }}>
              {names(c)}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
