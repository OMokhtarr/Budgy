import { useTranslation } from 'react-i18next';
import { SlideDeck, type DeckSlide } from './SlideDeck';
import type { Release } from './tourCatalog';

/** One slide per new feature, oldest release first; "Show me" takes the user to it. */
export default function WhatsNew({
  releases,
  onDone,
  onShowMe,
}: {
  releases: Release[];
  onDone: () => void;
  onShowMe: (route: string) => void;
}) {
  const { t } = useTranslation();

  const slides: DeckSlide[] = releases.flatMap((r) =>
    r.features.map((f) => ({
      key: f.key,
      art: f.art,
      title: t(`onboarding.releases.${f.key}.title`),
      body: t(`onboarding.releases.${f.key}.body`),
      action: { label: t('onboarding.controls.showMe'), onClick: () => onShowMe(f.route) },
    })),
  );

  return (
    <SlideDeck
      slides={slides}
      eyebrow={t('onboarding.controls.whatsNew')}
      finishLabel={t('onboarding.controls.done')}
      onFinish={onDone}
      onSkip={onDone}
    />
  );
}
