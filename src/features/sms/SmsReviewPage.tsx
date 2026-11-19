import { useEffect, useMemo, useState } from 'react';
import {
  IonBackButton, IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonPage, IonTitle, IonToolbar,
  useIonAlert, useIonRouter, useIonToast,
} from '@ionic/react';
import { chatboxEllipsesOutline, searchOutline, settingsOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { useConverter, useLocale, useSettings } from '@/core/contexts/SettingsContext';
import { categoryFits, useAccounts, useCategories, useNames } from '@/core/db/hooks';
import { usePro } from '@/core/pro/ProContext';
import { showsProLock } from '@/core/pro/rules';
import { usePaywall, useRequirePro } from '@/core/pro/useRequirePro';
import { dayTimeLabel } from '@/core/utils/period';
import ProBadge from '@/shared/components/ProBadge';
import { closeIcon } from '@/shared/icons';
import type { Flow, SmsPending, Transaction } from '@/shared/models';
import type { TxDraft } from '@/features/transactions/txRecord';
import { actionsFor, duplicatesOf, importMany } from './batch';
import { useLearned, usePendingSms } from './hooks';
import CombineSheet from './CombineSheet';
import { combineFlow, combineTexts, defaultNote, takeOff, type TextPart } from './grouping';
import { flowOf, resolveSkipped, suggestFor } from './learning';
import PickerSheet, { type PickerItem, type PickerSection } from './PickerSheet';
import PurchasePickerSheet from './PurchasePickerSheet';
import { addPerson, cardDraft, choiceOf, isPerson, usablePick, type CardChoice, type CardPick } from './review';
import { markPendingSeen } from './scan';
import ScanSheet from './ScanSheet';
import SmsItemCard from './SmsItemCard';
import SmsSettingsSheet, { PermissionNotes } from './SmsSettingsSheet';
import TextsSheet from './TextsSheet';
import { useBatchDuplicatePrompt } from './useBatchDuplicatePrompt';
import { useSmsAvailability } from './useSmsAvailable';
import { useSmsPermission } from './useSmsPermission';
import { tourAttr } from '@/features/onboarding/tourCatalog';
import { usePageTour } from '@/features/onboarding/usePageTour';

const PATH = '/sms';

/** What the picker sheet is choosing: one card's account or category, or one category for every selected text. */
type Picking =
  | { item: SmsPending; kind: 'account' | 'category' }
  | { kind: 'batch'; flow: Flow }
  | { kind: 'combine'; flow: Flow };

const toItem = (x: { id?: string; icon: string; color: string }, name: string): PickerItem => ({ id: x.id!, name, icon: x.icon, color: x.color });

/** Money-back items get their own ids: a category that takes both flows shows in both groups of the picker. */
const BACK = 'back:';

/**
 * "Bank texts": the scanned texts waiting for review, newest first. Long-press a card to act on several at once.
 * Also where reading bank texts is turned on, and where its settings live (the gear).
 */
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const perm = useSmsPermission();
  // Fingerprints of the texts picked for a batch action.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  // "Take off a purchase": the texts (the selection, or one card), then the purchase they come back on.
  const [takeOffFps, setTakeOffFps] = useState<string[]>([]);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [target, setTarget] = useState<Transaction | null>(null);
  const [textsOpen, setTextsOpen] = useState(false);
  // "Combine into one": the texts, and the entry's category (money in as money back or not) and note.
  const [combineFps, setCombineFps] = useState<string[]>([]);
  const [combineOpen, setCombineOpen] = useState(false);
  const [combineCat, setCombineCat] = useState<{ categoryId?: string; moneyBack: boolean }>({ moneyBack: false });
  const [combineNote, setCombineNote] = useState('');
  const [presentAlert] = useIonAlert();
  const [presentToast] = useIonToast();
  const askDuplicates = useBatchDuplicatePrompt();
  const conv = useConverter();
  const selecting = selected.size > 0;

  /** A card's choice: the suggestion with the user's usable picks (plus `extra`, if given) on top. */
  const choiceFor = (item: SmsPending, extra: CardPick = {}): CardChoice => {
    const s = suggestFor(item, learned?.links ?? [], learned?.rules ?? [], accounts ?? [], categories ?? []);
    return choiceOf(s, usablePick({ ...picks[item.fingerprint], ...extra }, flowOf(item), accounts ?? [], categories ?? []));
  };

  const choices = useMemo(() => {
    const map = new Map<string, CardChoice>();
    for (const item of items ?? []) map.set(item.fingerprint, choiceFor(item));
    return map;
  }, [items, learned, accounts, categories, picks]);

  const chosen = useMemo(() => (items ?? []).filter((x) => selected.has(x.fingerprint)), [items, selected]);
  const actions = actionsFor(chosen);

  const categoriesFor = (flow: Flow) =>
    (categories ?? []).filter((c) => !c.archived && categoryFits(c, flow)).map((c) => toItem(c, categoryName(c)));

  const pickerItems = useMemo((): PickerItem[] => {
    if (!picking) return [];
    if (picking.kind === 'batch' || picking.kind === 'combine') return categoriesFor(picking.flow);
    if (picking.kind === 'account') return (accounts ?? []).filter((a) => !a.archived).map((a) => toItem(a, accountName(a)));
    return categoriesFor(flowOf(picking.item));
  }, [picking, accounts, categories, accountName, categoryName]);

  const people = useMemo(() => (accounts ?? []).filter(isPerson).map((a) => toItem(a, accountName(a))), [accounts, accountName]);
  const moneyBackSection = (): PickerSection => ({
    title: t('sms.moneyBackOn'),
    items: categoriesFor('expense').map((c) => ({ ...c, id: BACK + c.id })),
  });

  // Waits for the availability check; and since hidden pages stay mounted in Ionic's stack, only
  // leaves while this page is the one showing.
  // Texts show once the permission is confirmed (or couldn't be checked): when it was taken away, reading turns
  // off a moment after opening, and the cards would flash before the "Turn on" screen.
  const allowed = available === true && smsImport.enabled && (perm.permission === 'granted' || perm.checkFailed);
  usePageTour(['sms'], { ready: allowed && !!items });
  const off = available === true && !smsImport.enabled;
  useEffect(() => {
    if (available === false && pathname === PATH) router.push('/categories', 'root', 'replace');
  }, [available, pathname, router]);

  // Texts on screen are seen: opening the app stops coming here until a scan adds new ones.
  const showingUnseen = allowed && pathname === PATH && !!items?.some((x) => x.unseen);
  useEffect(() => {
    if (showingUnseen) void markPendingSeen();
  }, [showingUnseen]);

  // Texts resolved (or gone) drop out of the selection, and all of them once reading is off.
  useEffect(() => {
    setSelected((s) => {
      if (!s.size) return s;
      if (!allowed) return new Set();
      const pending = new Set((items ?? []).map((x) => x.fingerprint));
      const next = new Set([...s].filter((fp) => pending.has(fp)));
      return next.size === s.size ? s : next;
    });
  }, [items, allowed]);

  // The selection bar takes the tab bar's place; the hardware back button leaves selection mode.
  useEffect(() => {
    document.body.classList.toggle('b-selecting', selecting);
    if (!selecting) return;
    const onBack = (e: Event) => (e as CustomEvent).detail.register(100, () => setSelected(new Set()));
    document.addEventListener('ionBackButton', onBack);
    return () => {
      document.body.classList.remove('b-selecting');
      document.removeEventListener('ionBackButton', onBack);
    };
  }, [selecting]);

  const toggle = (item: SmsPending) => {
    if (!selecting) Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(item.fingerprint)) next.delete(item.fingerprint);
      else next.add(item.fingerprint);
      return next;
    });
  };

  const toast = (message: string, color = 'medium') => void presentToast({ message, duration: 2600, position: 'top', color });
  const failed = () => toast(t('sms.actionFailed'), 'danger');

  const openPicker = (item: SmsPending, kind: 'account' | 'category') => {
    setPicking({ item, kind });
    setPickerOpen(true);
  };
  const setPick = (fp: string, patch: CardPick) => setPicks((p) => ({ ...p, [fp]: { ...p[fp], ...patch } }));

  /**
   * "Same category": every selected text gets the category and the complete ones are saved together, after one
   * question about any that look already added. Texts still missing an account stay, selected, with the category set.
   */
  const applyCategory = async (categoryId: string, moneyBack: boolean) => {
    const patch: CardPick = { categoryId, personId: undefined, moneyBack: moneyBack || undefined };
    const batch = chosen;
    setPicks((p) => Object.fromEntries([...Object.entries(p), ...batch.map((x) => [x.fingerprint, { ...p[x.fingerprint], ...patch }])]));
    const complete: { item: SmsPending; draft: TxDraft }[] = [];
    const incomplete: string[] = [];
    for (const item of batch) {
      const draft = cardDraft(item, choiceFor(item, patch), conv);
      if (draft) complete.push({ item, draft });
      else incomplete.push(item.fingerprint);
    }

    setBusy(true);
    try {
      const dupes = await duplicatesOf(complete.map(({ item, draft }) => ({ fingerprint: item.fingerprint, draft })));
      let toSave = complete;
      if (dupes.size) {
        const answer = await askDuplicates(dupes.size);
        if (answer === 'cancel') return;
        if (answer === 'skip') {
          await Promise.all(complete.filter(({ item }) => dupes.has(item.fingerprint)).map(({ item }) => resolveSkipped(item, 'duplicate')));
          toSave = complete.filter(({ item }) => !dupes.has(item.fingerprint));
        }
      }
      const { saved, failed: failedCount } = await importMany(toSave);
      setSelected(new Set(incomplete));
      const parts = [t('sms.batchSaved', { count: saved })];
      if (incomplete.length) parts.push(t('sms.batchNeedAccount', { count: incomplete.length }));
      if (failedCount) parts.push(t('sms.actionFailed'));
      toast(parts.join(' · '), failedCount ? 'danger' : 'medium');
    } catch {
      failed();
    } finally {
      setBusy(false);
    }
  };

  // A category (as money back or not) and a person take the same place on the card: picking one clears the other.
  const pick = (id: string) => {
    if (!picking) return;
    const moneyBack = id.startsWith(BACK);
    const categoryId = moneyBack ? id.slice(BACK.length) : id;
    if (picking.kind === 'batch') return void applyCategory(categoryId, moneyBack);
    if (picking.kind === 'combine') return setCombineCat({ categoryId, moneyBack });
    const fp = picking.item.fingerprint;
    if (picking.kind === 'account') setPick(fp, { accountId: id });
    else if (people.some((p) => p.id === id)) setPick(fp, { personId: id, categoryId: undefined, moneyBack: undefined });
    else setPick(fp, { categoryId, personId: undefined, moneyBack: moneyBack || undefined });
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
              .catch(failed);
          },
        },
      ],
    });

  // Money in can also be money back on an expense category, for a card or for every selected text.
  const sections: PickerSection[] =
    picking?.kind === 'category'
      ? [
          {
            title: t(flowOf(picking.item) === 'expense' ? 'sms.lentTo' : 'sms.paidBackBy'),
            items: people,
            addLabel: t('sms.newPerson'),
            onAdd: () => askNewPerson(picking.item),
          },
          ...(flowOf(picking.item) === 'income'
            ? [
                moneyBackSection(),
                { title: t('sms.takeOff'), items: [], addLabel: t('sms.pickPurchase'), onAdd: () => void requirePro(() => startTakeOff([picking.item.fingerprint])) },
              ]
            : []),
        ]
      : (picking?.kind === 'batch' || picking?.kind === 'combine') && picking.flow === 'income'
        ? [moneyBackSection()]
        : [];

  const startTakeOff = (fingerprints: string[]) => {
    setTakeOffFps(fingerprints);
    setPurchaseOpen(true);
  };
  const takeOffParts = takeOffFps
    .map((fp) => (items ?? []).find((x) => x.fingerprint === fp))
    .filter((x) => x != null)
    .map((item) => ({ item, accountId: choices.get(item.fingerprint)?.accountId }));
  const pickPartAccount = (fp: string) => {
    const item = items?.find((x) => x.fingerprint === fp);
    if (item) openPicker(item, 'account');
  };
  const takeOffReady = !!target && takeOffParts.length > 0 && takeOffParts.every((p) => p.accountId);

  const saveTakeOff = async () => {
    if (!target || !takeOffReady || busy) return;
    setBusy(true);
    try {
      const rows = await takeOff(takeOffParts as TextPart[], target, conv);
      setTextsOpen(false);
      setSelected(new Set());
      toast(t('sms.takenOff', { count: rows.length }));
    } catch {
      failed();
    } finally {
      setBusy(false);
    }
  };

  const partsOf = (fingerprints: string[]) =>
    fingerprints
      .map((fp) => (items ?? []).find((x) => x.fingerprint === fp))
      .filter((x) => x != null)
      .map((item) => ({ item, accountId: choices.get(item.fingerprint)?.accountId }));
  const combineParts = partsOf(combineFps);

  /** Starts with the note of the largest payment, and the category the first payment's card suggests. */
  const startCombine = () => {
    const firstOut = chosen.find((x) => x.direction !== 'in');
    setCombineFps(chosen.map((x) => x.fingerprint));
    setCombineNote(defaultNote(chosen) ?? '');
    setCombineCat({ categoryId: firstOut ? choices.get(firstOut.fingerprint)?.categoryId : undefined, moneyBack: false });
    setCombineOpen(true);
  };

  const saveCombine = async () => {
    const { categoryId, moneyBack } = combineCat;
    if (!categoryId || busy || combineParts.some((p) => !p.accountId)) return;
    setBusy(true);
    try {
      let parts = combineParts as TextPart[];
      let skipped: SmsPending[] = [];
      const dupes = await duplicatesOf(
        parts.map(({ item, accountId }) => ({
          fingerprint: item.fingerprint,
          draft: { type: item.direction === 'in' ? 'income' : 'expense', amount: item.amount!, currency: item.currency!, accountId, date: item.date },
        })),
      );
      if (dupes.size) {
        const answer = await askDuplicates(dupes.size);
        if (answer === 'cancel') return;
        if (answer === 'skip') {
          if (parts.length - dupes.size < 2) return toast(t('sms.combineNeedsTwo'));
          // Set aside together with the save, so a failed combine leaves them pending too.
          skipped = parts.filter((p) => dupes.has(p.item.fingerprint)).map((p) => p.item);
          parts = parts.filter((p) => !dupes.has(p.item.fingerprint));
        }
      }
      await combineTexts(parts, { categoryId, moneyBack, note: combineNote }, conv, undefined, skipped);
      setCombineOpen(false);
      setSelected(new Set());
      toast(t('sms.combined', { count: parts.length }));
    } catch {
      failed();
    } finally {
      setBusy(false);
    }
  };

  const pro = usePro();
  const requirePro = useRequirePro();
  const paywall = usePaywall();
  const sameCategory = () => {
    const first = chosen[0];
    if (!first) return;
    setPicking({ kind: 'batch', flow: flowOf(first) });
    setPickerOpen(true);
  };

  const scanButton = (
    <button className="b-btn b-btn--primary b-scanbtn" {...tourAttr('sms.scan')} onClick={() => void requirePro(() => setScanOpen(true))}>
      <IonIcon icon={searchOutline} />
      {t('sms.scan')}
    </button>
  );
  const count = items?.length ?? 0;
  const pickedChoice = picking && 'item' in picking ? choices.get(picking.item.fingerprint) : undefined;
  const pickerTitle = picking?.kind === 'account' ? t('sms.pickAccount') : picking?.kind === 'batch' ? t('sms.sameCategory') : t('sms.pickCategory');
  const pickerSelected =
    picking?.kind === 'account'
      ? pickedChoice?.accountId
      : picking?.kind === 'category'
        ? pickedChoice?.personId ?? (pickedChoice?.moneyBack ? BACK + pickedChoice.categoryId : pickedChoice?.categoryId)
        : picking?.kind === 'combine' && combineCat.categoryId
          ? (combineCat.moneyBack ? BACK : '') + combineCat.categoryId
          : undefined;

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        {selecting ? (
          <IonToolbar className="b-toolbar b-selbar">
            <IonButtons slot="start">
              <IonButton onClick={() => setSelected(new Set())} aria-label={t('common.close')}>
                <IonIcon slot="icon-only" icon={closeIcon} />
              </IonButton>
              <span className="b-selbar__count">{chosen.length}</span>
            </IonButtons>
          </IonToolbar>
        ) : (
          <IonToolbar className="b-toolbar">
            <IonButtons slot="start">
              <IonBackButton defaultHref="/categories" text="" />
            </IonButtons>
            <IonTitle className="b-title">{count ? `${t('sms.bankTexts')} (${count})` : t('sms.bankTexts')}</IonTitle>
            <IonButtons slot="end">
              {available === true && (
                <IonButton onClick={() => setSettingsOpen(true)} aria-label={t('sms.settingsTitle')}>
                  <IonIcon slot="icon-only" icon={settingsOutline} />
                </IonButton>
              )}
            </IonButtons>
          </IonToolbar>
        )}
      </IonHeader>
      <IonContent>
        {off && (
          <div className="b-page">
            <div className="b-empty b-smsempty">
              <IonIcon icon={chatboxEllipsesOutline} />
              <strong>{t('sms.offTitle')}</strong>
              <p>{t('sms.offBody')}</p>
              <button className="b-btn b-btn--primary b-scanbtn" onClick={() => void requirePro(perm.turnOn)}>
                {t('sms.turnOn')} {showsProLock(pro) && <ProBadge />}
              </button>
              <PermissionNotes perm={perm} />
            </div>
          </div>
        )}
        {allowed && items && (
          <div className="b-page">
            {showsProLock(pro) && (
              <div className="b-card b-smspro">
                <p>{t('sms.proBanner')}</p>
                <button className="b-btn b-btn--primary b-scanbtn" onClick={() => void paywall()}>
                  {t('pro.renew')}
                </button>
              </div>
            )}
            {!selecting && (count > 0 || smsImport.lastScanAt) && (
              <div className="b-smsbar">
                <p className="b-muted b-smslast">
                  {smsImport.lastScanAt &&
                    t('sms.lastScan', {
                      when: dayTimeLabel(new Date(smsImport.lastScanAt), locale, { today: t('period.today'), yesterday: t('period.yesterday') }),
                    })}
                </p>
                {count > 0 && scanButton}
              </div>
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
                    selecting={selecting}
                    selected={selected.has(item.fingerprint)}
                    onSelect={item.status === 'understood' ? () => toggle(item) : undefined}
                  />
                );
              })
            )}
          </div>
        )}
      </IonContent>

      {selecting && (
        <IonFooter className="b-smsbatch">
          {/* Only texts that all go the same way can share a category: say so rather than just greying it out. */}
          {chosen.length > 0 && !actions.sameCategory && <p className="b-smsbatch__hint">{t('sms.sameCategoryHint')}</p>}
          <button className="b-btn b-btn--primary" onClick={() => void requirePro(sameCategory)} disabled={busy || !actions.sameCategory}>
            {t('sms.sameCategory')}
          </button>
          <button className="b-btn b-btn--muted" onClick={() => void requirePro(startCombine)} disabled={busy || !actions.combine}>
            {t('sms.combine')}
          </button>
          <button className="b-btn b-btn--muted" onClick={() => void requirePro(() => startTakeOff(chosen.map((x) => x.fingerprint)))} disabled={busy || !actions.takeOff}>
            {t('sms.takeOff')}
          </button>
        </IonFooter>
      )}

      <ScanSheet isOpen={scanOpen} onClose={() => setScanOpen(false)} />
      <SmsSettingsSheet isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} perm={perm} />
      <CombineSheet
        isOpen={combineOpen}
        parts={combineParts}
        category={categories?.find((c) => c.id === combineCat.categoryId)}
        moneyBack={combineCat.moneyBack}
        note={combineNote}
        busy={busy}
        onPickAccount={pickPartAccount}
        onPickCategory={() => {
          setPicking({ kind: 'combine', flow: combineFlow(combineParts.map((p) => p.item)) });
          setPickerOpen(true);
        }}
        onNote={setCombineNote}
        onSave={() => void saveCombine()}
        onClose={() => setCombineOpen(false)}
      />
      <PurchasePickerSheet
        isOpen={purchaseOpen}
        onPick={(tx) => {
          setTarget(tx);
          setTextsOpen(true);
        }}
        onClose={() => setPurchaseOpen(false)}
      />
      <TextsSheet
        isOpen={textsOpen}
        title={t('sms.takeOffFrom', { name: target?.note || categoryName(categories?.find((c) => c.id === target?.categoryId)) })}
        parts={takeOffParts}
        onPickAccount={pickPartAccount}
        footer={
          <button className="b-btn b-btn--primary" onClick={() => void saveTakeOff()} disabled={busy || !takeOffReady}>
            {t('common.save')}
          </button>
        }
        onClose={() => setTextsOpen(false)}
      />
      <PickerSheet
        isOpen={pickerOpen}
        title={pickerTitle}
        items={pickerItems}
        selectedId={pickerSelected}
        sections={sections}
        onPick={pick}
        onClose={() => setPickerOpen(false)}
      />
    </IonPage>
  );
}
