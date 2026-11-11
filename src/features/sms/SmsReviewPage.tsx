import { useEffect, useMemo, useState } from 'react';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonPage, IonTitle, IonToolbar, useIonAlert, useIonRouter, useIonToast } from '@ionic/react';
import { chatboxEllipsesOutline, searchOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { useConverter, useLocale, useSettings } from '@/core/contexts/SettingsContext';
import { categoryFits, useAccounts, useCategories, useNames } from '@/core/db/hooks';
import { dayTimeLabel } from '@/core/utils/period';
import type { SmsPending } from '@/shared/models';
import { useLearned, usePendingSms } from './hooks';
import { flowOf, suggestFor } from './learning';
import PickerSheet, { type PickerItem, type PickerSection } from './PickerSheet';
import { addPerson, choiceOf, isPerson, usablePick, type CardChoice, type CardPick } from './review';
import ScanSheet from './ScanSheet';
import SmsItemCard from './SmsItemCard';
import { useSmsAvailability } from './useSmsAvailable';

const PATH = '/sms';

type Picking = { item: SmsPending; kind: 'account' | 'category' };

const toItem = (x: { id?: string; icon: string; color: string }, name: string): PickerItem => ({ id: x.id!, name, icon: x.icon, color: x.color });

/** "Bank texts": the scanned texts waiting for review, newest first. */
export default function SmsReviewPage() {
  const { t } = useTranslation();
  const locale = useLocale();
  const { pathname } = useLocation();
  const router = useIonRouter();
  const available = useSmsAvailability();
  const { smsImport } = useSettings();
  const { accountName, categoryName } = useNames();
  const items = usePendingSms();
  const learned = useLearned();
  const accounts = useAccounts(true);
  const categories = useCategories(undefined, true);
  // Chip choices per card, by fingerprint; a choice overrides the suggestion.
  const [picks, setPicks] = useState<Record<string, CardPick>>({});
  // Kept after the picker closes, so the sheet doesn't empty while it slides away.
  const [picking, setPicking] = useState<Picking | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [presentAlert] = useIonAlert();
  const [presentToast] = useIonToast();
  const conv = useConverter();

  const choices = useMemo(() => {
    const map = new Map<string, CardChoice>();
    for (const item of items ?? []) {
      const s = suggestFor(item, learned?.links ?? [], learned?.rules ?? [], accounts ?? [], categories ?? []);
      const pick = usablePick(picks[item.fingerprint], flowOf(item), accounts ?? [], categories ?? []);
      map.set(item.fingerprint, choiceOf(s, pick));
    }
    return map;
  }, [items, learned, accounts, categories, picks]);

  const pickerItems = useMemo((): PickerItem[] => {
    if (!picking) return [];
    if (picking.kind === 'account') return (accounts ?? []).filter((a) => !a.archived).map((a) => toItem(a, accountName(a)));
    const flow = flowOf(picking.item);
    return (categories ?? []).filter((c) => !c.archived && categoryFits(c, flow)).map((c) => toItem(c, categoryName(c)));
  }, [picking, accounts, categories, accountName, categoryName]);

  const people = useMemo(() => (accounts ?? []).filter(isPerson).map((a) => toItem(a, accountName(a))), [accounts, accountName]);

  // Waits for the availability check; and since hidden pages stay mounted in Ionic's stack, only
  // leaves while this page is the one showing.
  const allowed = available === true && smsImport.enabled;
  const blocked = available === false || (available === true && !smsImport.enabled);
  useEffect(() => {
    if (blocked && pathname === PATH) router.push('/categories', 'root', 'replace');
  }, [blocked, pathname, router]);

  const openPicker = (item: SmsPending, kind: Picking['kind']) => {
    setPicking({ item, kind });
    setPickerOpen(true);
  };
  const setPick = (fp: string, patch: CardPick) => setPicks((p) => ({ ...p, [fp]: { ...p[fp], ...patch } }));
  // A category and a person take the same place on the card: picking one clears the other.
  const pick = (id: string) => {
    if (!picking) return;
    const fp = picking.item.fingerprint;
    if (picking.kind === 'account') setPick(fp, { accountId: id });
    else if (people.some((p) => p.id === id)) setPick(fp, { personId: id, categoryId: undefined });
    else setPick(fp, { categoryId: id, personId: undefined });
  };

  /** Asks for a name, adds them as a debt and picks them for the card. */
  const askNewPerson = (item: SmsPending) =>
    void presentAlert({
      header: t('sms.newPersonTitle'),
      inputs: [{ name: 'name', type: 'text', placeholder: t('sms.newPersonPlaceholder') }],
      buttons: [
        { text: t('common.cancel'), role: 'cancel' },
        {
          text: t('sms.addSender'),
          handler: (data: { name?: string }) => {
            const name = data.name?.trim();
            if (!name) return false;
            addPerson(name, item.currency ?? conv.base)
              .then((id) => setPick(item.fingerprint, { personId: id, categoryId: undefined }))
              .catch(() => void presentToast({ message: t('sms.actionFailed'), duration: 3000, position: 'top', color: 'danger' }));
          },
        },
      ],
    });

  const section: PickerSection | undefined =
    picking?.kind === 'category'
      ? {
          title: t(flowOf(picking.item) === 'expense' ? 'sms.lentTo' : 'sms.paidBackBy'),
          items: people,
          addLabel: t('sms.newPerson'),
          onAdd: () => askNewPerson(picking.item),
        }
      : undefined;

  const scanButton = (
    <button className="b-btn b-btn--primary b-scanbtn" onClick={() => setScanOpen(true)}>
      <IonIcon icon={searchOutline} />
      {t('sms.scan')}
    </button>
  );
  const count = items?.length ?? 0;
  const pickedChoice = picking ? choices.get(picking.item.fingerprint) : undefined;

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar className="b-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/categories" text="" />
          </IonButtons>
          <IonTitle className="b-title">{count ? `${t('sms.bankTexts')} (${count})` : t('sms.bankTexts')}</IonTitle>
          {allowed && count > 0 && <IonButtons slot="end">{scanButton}</IonButtons>}
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {allowed && items && (
          <div className="b-page">
            {smsImport.lastScanAt && (
              <p className="b-muted b-smslast">
                {t('sms.lastScan', {
                  when: dayTimeLabel(new Date(smsImport.lastScanAt), locale, { today: t('period.today'), yesterday: t('period.yesterday') }),
                })}
              </p>
            )}
            {items.length === 0 ? (
              <div className="b-empty b-smsempty">
                <IonIcon icon={chatboxEllipsesOutline} />
                <strong>{t('sms.emptyTitle')}</strong>
                <p>{t('sms.emptyBody')}</p>
                {scanButton}
              </div>
            ) : (
              items.map((item) => {
                const choice = choices.get(item.fingerprint) ?? {};
                return (
                  <SmsItemCard
                    key={item.fingerprint}
                    item={item}
                    choice={choice}
                    account={accounts?.find((a) => a.id === choice.accountId)}
                    category={categories?.find((c) => c.id === choice.categoryId)}
                    person={choice.personId ? accounts?.find((a) => a.id === choice.personId) : undefined}
                    onPickAccount={() => openPicker(item, 'account')}
                    onPickCategory={() => openPicker(item, 'category')}
                  />
                );
              })
            )}
          </div>
        )}
      </IonContent>

      <ScanSheet isOpen={scanOpen} onClose={() => setScanOpen(false)} />
      <PickerSheet
        isOpen={pickerOpen}
        title={picking?.kind === 'account' ? t('sms.pickAccount') : t('sms.pickCategory')}
        items={pickerItems}
        selectedId={picking?.kind === 'account' ? pickedChoice?.accountId : pickedChoice?.personId ?? pickedChoice?.categoryId}
        section={section}
        onPick={pick}
        onClose={() => setPickerOpen(false)}
      />
    </IonPage>
  );
}
