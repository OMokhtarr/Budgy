import { useState } from 'react';
import { IonModal } from '@ionic/react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/core/contexts/SettingsContext';
import { guessCurrency } from './currencyGuess';
import CurrencyChips from './CurrencyChips';
import { useApplyCurrency } from './useApplyCurrency';

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

export default function FirstRunCurrency() {
  const { t } = useTranslation();
  const { currency } = useSettings();
  const applyCurrency = useApplyCurrency();
  const [open, setOpen] = useState(isPending);
  const [pick, setPick] = useState(() => guessCurrency(navigator.language ?? '', currency));

  const done = async () => {
    await applyCurrency(pick);
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
          <CurrencyChips value={pick} onChange={setPick} />
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
