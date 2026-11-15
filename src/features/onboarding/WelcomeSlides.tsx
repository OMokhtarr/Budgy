import { useRef, useState } from 'react';
import { useIonToast } from '@ionic/react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/core/contexts/SettingsContext';
import { guessCurrency } from './currencyGuess';
import CurrencyChips from './CurrencyChips';
import { SlideDeck, type DeckSlide } from './SlideDeck';
import { WELCOME_SLIDES, type WelcomeSlideId } from './tourCatalog';
import { useApplyCurrency } from './useApplyCurrency';

const LANGUAGES = ['en', 'ar'] as const;

/**
 * The first-install deck. Slide 1 sets the language the rest is read in; with `withCurrency` the
 * last slide picks the currency, and Skip jumps to it rather than leaving, since the currency must
 * be picked before the app is used. Without it (replayed from Settings) the deck simply ends.
 */
export default function WelcomeSlides({ withCurrency, onDone }: { withCurrency: boolean; onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const { currency } = useSettings();
  const applyCurrency = useApplyCurrency();
  const [pick, setPick] = useState(() => guessCurrency(navigator.language ?? '', currency));
  const [busy, setBusy] = useState(false);
  // Set at once, so a second tap in the same tick cannot apply the currency twice.
  const applying = useRef(false);
  const [presentToast] = useIonToast();

  const langPick = (
    <div className="ob-lang-row" role="group" aria-label={t('onboarding.controls.chooseLanguage')}>
      {LANGUAGES.map((l) => (
        <button
          key={l}
          type="button"
          className={'ob-lang-btn' + (i18n.language === l ? ' is-active' : '')}
          aria-pressed={i18n.language === l}
          onClick={() => void i18n.changeLanguage(l)}
        >
          {l === 'ar' ? t('onboarding.controls.arabic') : t('onboarding.controls.english')}
        </button>
      ))}
    </div>
  );

  const extras: Partial<Record<WelcomeSlideId, DeckSlide['extra']>> = {
    welcome: langPick,
    currency: <CurrencyChips value={pick} onChange={setPick} />,
  };

  const slides: DeckSlide[] = WELCOME_SLIDES.filter((s) => withCurrency || s.id !== 'currency').map((s) => ({
    key: s.id,
    art: s.art,
    title: t(`onboarding.slides.${s.id}.title`),
    body: t(`onboarding.slides.${s.id}.body`),
    extra: extras[s.id],
  }));

  if (!withCurrency) {
    return <SlideDeck slides={slides} finishLabel={t('onboarding.controls.getStarted')} onFinish={onDone} onSkip={onDone} />;
  }

  // On failure the user stays on the currency slide and can try again.
  const finish = async () => {
    if (applying.current) return;
    applying.current = true;
    setBusy(true);
    try {
      await applyCurrency(pick);
    } catch (err) {
      console.error('Could not apply the picked currency', err);
      void presentToast({ message: t('onboarding.controls.currencyFailed'), duration: 3000, position: 'top', color: 'medium' });
      return;
    } finally {
      applying.current = false;
      setBusy(false);
    }
    onDone();
  };

  return (
    <SlideDeck
      slides={slides}
      skipTo={slides.length - 1}
      finishLabel={t('onboarding.continue', { currency: pick })}
      finishDisabled={busy}
      locked={busy}
      onFinish={() => void finish()}
      onSkip={onDone}
    />
  );
}
