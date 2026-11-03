import { useMemo, useState, type CSSProperties } from 'react';
import { IonModal } from '@ionic/react';
import { useTranslation } from 'react-i18next';
import { CURRENCIES, useLocale, useSettings } from '@/core/contexts/SettingsContext';
import { moveAccountsToCurrency, unusedAccountsIn } from '@/core/db/db';

/**
 * One-time "Which currency do you use?" sheet on a fresh install, so the starting accounts and
 * every total are in the user's currency instead of the EGP default. Stays pending (and comes back
 * on the next launch) until a currency is picked.
 */
const STORAGE_KEY = 'budgy-pick-currency';

/** Called once the database was seeded for the first time. */
export function markFirstRun() {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* storage unavailable: skip the picker */
  }
}

function isPending(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Countries whose currency is in the list, for guessing from the device language ("ar-SA" → SAR). */
const REGION_CURRENCY: Record<string, string> = {
  EG: 'EGP', US: 'USD', GB: 'GBP', SA: 'SAR', AE: 'AED', QA: 'QAR', KW: 'KWD', BH: 'BHD', OM: 'OMR', JO: 'JOD',
  MA: 'MAD', TR: 'TRY', IN: 'INR', PK: 'PKR', CA: 'CAD', AU: 'AUD', JP: 'JPY', CN: 'CNY', CH: 'CHF',
  DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR', IE: 'EUR', PT: 'EUR', FI: 'EUR', GR: 'EUR',
};

function guessCurrency(fallback: string): string {
  const region = /[-_]([A-Za-z]{2})\b/.exec(navigator.language ?? '')?.[1]?.toUpperCase();
  return (region && REGION_CURRENCY[region]) || fallback;
}

export default function FirstRunCurrency() {
  const { t } = useTranslation();
  const locale = useLocale();
  const { currency, update } = useSettings();
  const [open, setOpen] = useState(isPending);
  const [pick, setPick] = useState(() => guessCurrency(currency));

  const names = useMemo(() => {
    try {
      const dn = new Intl.DisplayNames([locale], { type: 'currency' });
      return (c: string) => dn.of(c) ?? c;
    } catch {
      return (c: string) => c;
    }
  }, [locale]);

  // The guess first, then the rest in the usual order.
  const list = [pick, ...CURRENCIES.filter((c) => c !== pick)];

  const done = async () => {
    // Nothing has been entered yet, so the starting accounts simply move to the chosen currency.
    if (pick !== currency) {
      const unused = await unusedAccountsIn(currency);
      update({ currency: pick });
      if (unused.length) await moveAccountsToCurrency(unused, pick);
    }
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  return (
    <IonModal
      className="b-sheet-modal"
      isOpen={open}
      breakpoints={[0, 1]}
      initialBreakpoint={1}
      handle={false}
      backdropDismiss={false}
      onDidDismiss={() => setOpen(false)}
    >
      <div className="b-sheet">
        <div className="b-sheet__head" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          <h2>{t('onboarding.currencyTitle')}</h2>
          <p className="b-muted" style={{ margin: 0, fontSize: 13.5 }}>{t('onboarding.currencyHint')}</p>
        </div>
        <div className="b-sheet__body" style={{ paddingTop: 12 }}>
          <div className="b-chipgrid">
            {list.map((c) => (
              <button
                key={c}
                className={`b-acchip ${c === pick ? 'is-on' : ''}`}
                style={{ '--c': 'var(--ion-color-primary)' } as CSSProperties}
                onClick={() => setPick(c)}
                aria-pressed={c === pick}
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
        </div>
        <div className="b-sheet__foot" style={{ gridTemplateColumns: '1fr' }}>
          <button className="b-btn b-btn--primary" onClick={() => void done()}>
            {t('onboarding.continue', { currency: pick })}
          </button>
        </div>
      </div>
    </IonModal>
  );
}
