import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { IonDatetime, IonIcon, IonModal, useIonActionSheet, useIonAlert, useIonToast } from '@ionic/react';
import {
  albumsOutline, arrowForwardOutline, backspaceOutline, calendarOutline, checkmarkOutline, flashOutline, playSkipForwardOutline, receiptOutline,
  repeatOutline, trashOutline,
} from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { useLiveQuery } from 'dexie-react-hooks';
import { alive, db, softDelete } from '@/core/db/db';
import { groupRows } from './bulk';
import { useAccounts, useBalances, useCategories, useNames } from '@/core/db/hooks';
import { evaluate, hasOperator, pressKey } from '@/core/utils/calc';
import { defaultAccountFor } from '@/core/utils/defaultAccount';
import { addDays, dayKey, isSameDay } from '@/core/utils/period';
import { pickableSubcategories } from '@/core/utils/subcategories';
import { useConverter, useLocale, useMoney } from '@/core/contexts/SettingsContext';
import { currenciesOf, decimalsOf } from '@/core/utils/currency';
import { cleanNumberInput, parseNumber } from '@/core/utils/number';
import { formatRate, impliedRate, rateDirection, rateToSave, receivedAt } from '@/core/utils/txRate';
import type { EditorInit } from '@/core/contexts/TxEditorContext';
import type { Account, Category, Transaction, TxType } from '@/shared/models';
import Bubble from '@/shared/components/Bubble';
import { iconFor } from '@/shared/icons';
import { useDuplicatePrompt } from '@/features/sms/useDuplicatePrompt';
import { buildTxRecord, saveTx } from './txRecord';
import { tourAttr } from '@/features/onboarding/tourCatalog';
import { usePageTour } from '@/features/onboarding/usePageTour';
import { REPEATS, repeatOf, type RepeatName } from '@/core/utils/recurring';
import { addOccurrence, makeRecurring, saveRecurring, skipOccurrence, stopRecurring } from '@/features/recurring/actions';
import { useRateFor } from '@/features/recurring/hooks';
import { useOpenRecurring } from '@/features/recurring/useOpenRecurring';
import { cashFeeFor, isCashWithdrawal, isCreditCard } from '@/core/utils/creditCard';
import { cashFeeToSave, saveWithCashFee } from '@/features/accounts/card/cashFee';
import { convertToPlan, createPlan, toPlanOptions } from '@/features/accounts/card/instalments';
import InstalmentSheet, { instalmentChipLabel, type InstalmentChoice } from './InstalmentSheet';

const LAST_ACCOUNT_KEY = 'budgy-last-account';

/** The account the last transaction was written from, if any. */
export function lastAccount(): string | undefined {
  try {
    const v = localStorage.getItem(LAST_ACCOUNT_KEY);
    return v || undefined;
  } catch {
    return undefined;
  }
}

type Side = 'from' | 'to';

/** Shrinks the big amount as it gets longer so it never overflows. */
function fitClass(text: string): string {
  return text.length > 17 ? 'is-xs' : text.length > 12 ? 'is-sm' : '';
}

export default function TransactionEditor({ init, onClose }: { init: EditorInit; onClose: () => void }) {
  const { t } = useTranslation();
  usePageTour(['editor'], { overOverlay: true });
  const money = useMoney();
  const conv = useConverter();
  const locale = useLocale();
  const { accountName, categoryName } = useNames();
  const [presentToast] = useIonToast();
  const [presentAlert] = useIonAlert();
  const askDuplicate = useDuplicatePrompt();
  const [presentSheet] = useIonActionSheet();
  const rateFor = useRateFor();
  const { openRule } = useOpenRecurring();

  const accounts = useAccounts();
  const allAccounts = useAccounts(true);
  const expenseCats = useCategories('expense');
  const incomeCats = useCategories('income');
  const allCats = useCategories(undefined, true);
  const balances = useBalances();

  const tx = init.tx;
  const [type, setType] = useState<TxType>(tx?.type ?? init.type ?? 'expense');
  const [accountId, setAccountId] = useState<string | undefined>(tx?.accountId ?? init.accountId);
  const [toAccountId, setToAccountId] = useState<string | undefined>(tx?.toAccountId ?? init.toAccountId);
  const [categoryId, setCategoryId] = useState<string | undefined>(tx?.categoryId ?? init.categoryId);
  const [subcategoryId, setSubcategoryId] = useState<string | undefined>(tx?.subcategoryId ?? init.subcategoryId);
  // Money back on a purchase: income in an expense category (see Transaction.moneyBack). Only income keeps it.
  const [moneyBack, setMoneyBack] = useState(!!(tx?.moneyBack ?? init.moneyBack));
  // A grouped transaction's category belongs to its group, and is changed there, while the group has other rows.
  const groupSize = useLiveQuery(async () => (tx?.groupId ? (await groupRows(tx.groupId)).length : 0), [tx?.groupId]);
  const grouped = (groupSize ?? 0) > 1;
  const [expr, setExpr] = useState<string>(tx ? String(tx.amount) : init.amount ? String(init.amount) : '');
  // Currency the user picked for the amount, and for what arrives in a transfer.
  const [curPick, setCurPick] = useState<string | undefined>(tx?.currency ?? init.currency);
  const [toCurPick, setToCurPick] = useState<string | undefined>(tx?.toCurrency ?? init.toCurrency);
  // Received amount of a cross-currency transfer. Follows the exchange rate until the user types it,
  // and `touchedPair` remembers which currency pair the typed value belongs to.
  const startTo = tx?.toAmount != null ? tx : init.toAmount != null ? init : undefined;
  const [expr2, setExpr2] = useState<string>(startTo ? String(startTo.toAmount) : '');
  const [touchedPair, setTouchedPair] = useState<string | null>(startTo ? `${startTo.currency}>${startTo.toCurrency}` : null);
  const [active, setActive] = useState<Side>('from');
  // Exchange rate the user typed, and the currency (or pair) it belongs to.
  const [rateEdit, setRateEdit] = useState<{ key: string; text: string } | null>(null);
  const [note, setNote] = useState(tx?.note ?? init.note ?? '');
  // The transaction's own time (or the bank text's), kept on save while the day isn't changed.
  const keptDate = tx?.date ?? init.date;
  const [date, setDate] = useState<string>(dayKey(keptDate ? new Date(keptDate) : new Date()));
  const [picking, setPicking] = useState<Side | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const saving = useRef(false);

  // ── repeating ──
  // Editing a recurring transaction ('new' makes one), or adding one of its occurrences that's due.
  const ruleMode = init.recurring != null;
  const editingRule = typeof init.recurring === 'object' ? init.recurring : undefined;
  const due = init.due;
  // The recurring transaction this one was added from, while it still repeats.
  const linkedRule = useLiveQuery(async () => {
    if (!tx?.recurringId) return null;
    const r = await db.recurring.get(tx.recurringId);
    return r && alive(r) ? r : null;
  }, [tx?.recurringId]);
  const [repeat, setRepeat] = useState<RepeatName | null>(
    editingRule ? repeatOf(editingRule) : (init.repeat ?? (ruleMode ? 'monthly' : null)),
  );
  const [auto, setAuto] = useState(!!editingRule?.auto);

  // ── instalments ──
  const [plan, setPlan] = useState<InstalmentChoice | undefined>(init.instalments);
  const [planOpen, setPlanOpen] = useState(false);

  const account = allAccounts?.find((a) => a.id === accountId);
  const toAccount = allAccounts?.find((a) => a.id === toAccountId);
  // A credit card purchase can be paid in instalments; not one that repeats, is grouped, or is already one.
  const canInstal =
    type === 'expense' && !!account && isCreditCard(account) && !ruleMode && !due && !tx?.instalment && !tx?.groupId && !tx?.recurringId;
  const instalPlan = canInstal ? plan : undefined;

  // ── cash withdrawal fee ──
  // Typed by the user, for the currency it was typed in: wins over the card's rule while that currency is picked.
  const [feeTyped, setFeeTyped] = useState<{ text: string; currency: string } | undefined>();
  const [feeRemoved, setFeeRemoved] = useState(false);

  // Follows the transaction type until an account is chosen on purpose.
  const accountChosen = useRef(tx?.accountId != null || init.accountId != null);
  useEffect(() => {
    if (!accounts?.length || accountChosen.current) return;
    setAccountId(defaultAccountFor(accounts, type, lastAccount()));
  }, [accounts, type]);

  // Default destination for transfers: first account that isn't the source.
  // A two-currency account may transfer to itself (exchanging one currency for the other).
  useEffect(() => {
    if (type !== 'transfer' || !accounts?.length || accountId == null) return;
    if (toAccountId == null || (toAccountId === accountId && account && !account.currency2)) {
      setToAccountId(accounts.find((a) => a.id !== accountId)?.id);
    }
  }, [type, accounts, account, accountId, toAccountId]);

  const back = moneyBack && type === 'income';
  const cats = type === 'income' && !back ? incomeCats : expenseCats;
  const category = allCats?.find((c) => c.id === categoryId);
  const subcategories = type === 'transfer' ? [] : pickableSubcategories(category, subcategoryId);

  // All three types for a brand-new transaction from the + button or a bank text. A transfer stays a
  // transfer; an expense/income (new from a category, or being edited) offers just the types its category accepts.
  const fromBankText = !tx && init.smsFingerprint != null;
  const byCategory = tx ? tx.type !== 'transfer' : init.categoryId != null && !fromBankText;
  const types: TxType[] =
    tx?.type === 'transfer' ? ['transfer']
    : !byCategory ? ['expense', 'income', 'transfer']
    : back ? ['expense', 'income']
    : !category ? [type]
    : category.kind === 'both' ? ['expense', 'income']
    : [category.kind];

  // ── currencies ──
  // When editing, the transaction's own currency stays on offer even if its account no longer
  // holds it (e.g. the account's currency was changed), so saving doesn't relabel the amount.
  // A pre-filled currency (a bank text's) stays on offer on whichever account is picked, for the same reason.
  const keep = (list: string[], cur?: string) => (cur && !list.includes(cur) ? [...list, cur] : list);
  const fromCurs = account
    ? keep(keep(currenciesOf(account), tx && tx.accountId === account.id ? tx.currency : undefined), init.currency)
    : [];
  const currency = curPick && fromCurs.includes(curPick) ? curPick : account?.currency ?? conv.base;
  const sameAccount = type === 'transfer' && toAccountId === accountId;
  const keptTo = tx?.type === 'transfer' && tx.toAccountId === toAccount?.id ? tx.toCurrency ?? tx.currency : undefined;
  const toCurs = toAccount ? keep(currenciesOf(toAccount), keptTo).filter((c) => !(sameAccount && c === currency)) : [];
  const toCurrency =
    type !== 'transfer' ? currency
    : toCurPick && toCurs.includes(toCurPick) ? toCurPick
    : toCurs.includes(currency) ? currency
    : toCurs[0] ?? currency;
  const cross = type === 'transfer' && toCurrency !== currency;
  // An expense/income in a currency its account doesn't hold (e.g. a USD text on an EGP card).
  const notHeld = type !== 'transfer' && account != null && !currenciesOf(account).includes(currency);
  const pair = `${currency}>${toCurrency}`;

  const pickCurrency = (c: string) => {
    setCurPick(c);
    setToCurPick(undefined);
  };

  const switchType = (next: TxType) => {
    if (next === type) return;
    setType(next);
    setPicking(null);
    // Money back is income; as an expense or a transfer it's an ordinary one.
    if (next !== 'income') setMoneyBack(false);
    if (next !== 'transfer') {
      const list = next === 'income' ? incomeCats : expenseCats;
      if (!list?.some((c) => c.id === categoryId)) setCategoryId(undefined);
    }
  };

  const decimals = decimalsOf(currency);
  const toDecimals = decimalsOf(toCurrency);
  const amount = useMemo(() => evaluate(expr, decimals), [expr, decimals]);
  const typedTo = useMemo(() => evaluate(expr2, toDecimals), [expr2, toDecimals]);

  // A new transfer taking cash out on a credit card: the bank charges a fee, and interest from that day.
  const withdrawal = type === 'transfer' && tx?.id == null && !ruleMode && !due && !repeat && isCashWithdrawal(account, toAccount);
  const feeFromRule = withdrawal && account && isCreditCard(account) ? cashFeeFor(account, amount, currency) : undefined;
  const fee = cashFeeToSave({ withdrawal, removed: feeRemoved, typed: feeTyped, fromRule: feeFromRule, currency });
  const editFee = () =>
    presentAlert({
      header: t('cards.cashFeeNote'),
      inputs: [{ name: 'fee', type: 'text', value: fee != null ? String(fee) : '', attributes: { inputmode: 'decimal' } }],
      buttons: [
        { text: t('cards.cashFeeNone'), role: 'destructive', handler: () => setFeeRemoved(true) },
        { text: t('common.cancel'), role: 'cancel' },
        {
          text: t('common.done'),
          handler: (data: { fee?: string }) => {
            setFeeTyped({ text: cleanNumberInput(data.fee ?? ''), currency });
            setFeeRemoved(false);
          },
        },
      ],
    });
  const toTouched = cross && touchedPair === pair;

  // ── exchange rate: each transaction's own, starting from the saved one ──
  const foreignAmount = type !== 'transfer' && currency !== conv.base;
  const ownRate = tx?.currency === currency ? tx : undefined;
  const [rateUnit, rateQuote] = cross ? rateDirection(currency, toCurrency, conv.base) : [currency, ownRate?.rateCurrency ?? conv.base];
  const unitRate = conv.rate(rateUnit);
  const quoteRate = conv.rate(rateQuote);
  const savedRate = unitRate && quoteRate ? unitRate / quoteRate : undefined;
  const rateKey = cross ? pair : currency;
  const rateText = rateEdit?.key === rateKey ? rateEdit.text : undefined;
  const typedRate = (rateText && parseNumber(rateText)) || undefined;

  const autoTo = !cross ? amount
    : typedRate ? receivedAt(amount, typedRate, currency, toCurrency, rateUnit)
    : conv.convert(amount, currency, toCurrency) ?? 0;
  const toAmount = toTouched ? typedTo : autoTo;
  const received = toTouched ? impliedRate(amount, typedTo, currency, rateUnit) : undefined;
  const shownRate = received ?? (rateText === undefined ? (!cross && ownRate?.rate) || savedRate : undefined);
  const rateValue = shownRate ? formatRate(shownRate) : rateText ?? '';

  /** The rate decides the received amount from here, until the user types one again. */
  const typeRate = (text: string) => {
    setRateEdit({ key: rateKey, text: cleanNumberInput(text) });
    if (cross) {
      setTouchedPair(null);
      setActive('from');
    }
  };
  const editingTo = cross && active === 'to';
  const anyPending = hasOperator(expr) || (cross && hasOperator(expr2));

  const press = (k: string) => {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    if (editingTo) setExpr2((e) => pressKey(e, k, toDecimals));
    else setExpr((e) => pressKey(e, k, decimals));
  };

  /** Points the keypad at the sent or the received amount of a cross-currency transfer. */
  const focus = (side: Side) => {
    if (side === 'to' && !toTouched) {
      setExpr2(autoTo ? String(autoTo) : '');
      setTouchedPair(pair);
    }
    setActive(side);
  };

  const save = async () => {
    if (anyPending) {
      setExpr((e) => pressKey(e, '=', decimals));
      setExpr2((e) => pressKey(e, '=', toDecimals));
      return;
    }
    const toast = (msg: string) => presentToast({ message: msg, duration: 1600, position: 'top', color: 'medium' });
    if (!(amount > 0)) return toast(t('editor.enterAmount'));
    if (accountId == null) return toast(t('editor.chooseAccount'));
    if (type !== 'transfer' && categoryId == null) {
      setPicking(type === 'expense' ? 'to' : 'from');
      return toast(t('editor.chooseCategory'));
    }
    if (type === 'transfer' && (toAccountId == null || (toAccountId === accountId && !cross))) {
      setPicking('to');
      return toast(t('editor.chooseOtherAccount'));
    }
    if (cross && !(toAmount > 0)) {
      focus('to');
      return toast(t('editor.enterReceived'));
    }

    let iso: string;
    if (keptDate && dayKey(new Date(keptDate)) === date) {
      iso = keptDate;
    } else {
      const [y, m, d] = date.split('-').map(Number);
      const now = new Date();
      iso = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString();
    }

    // A quick double tap on ✓ would otherwise add the transaction twice.
    if (saving.current) return;
    saving.current = true;

    let saved: Transaction | undefined;
    try {
      if (fromBankText) {
        const { choice, match } = await askDuplicate({ type, amount, currency, accountId, date: iso });
        if (choice === 'cancel') {
          saving.current = false;
          return;
        }
        if (choice === 'skip') {
          onClose();
          init.onSkipped?.(match);
          return;
        }
      }
      const record = buildTxRecord({
        type,
        amount,
        currency,
        accountId,
        toAccountId,
        toAmount: cross ? toAmount : undefined,
        toCurrency: cross ? toCurrency : undefined,
        categoryId,
        subcategoryId: subcategories.find((s) => s.id === subcategoryId)?.id,
        rate:
          type === 'transfer'
            ? undefined
            : rateToSave({ typed: typedRate, saved: conv.rate(currency), editing: tx, currency, base: conv.base }),
        date: iso,
        note,
        smsFingerprint: tx?.smsFingerprint ?? init.smsFingerprint,
        moneyBack: back,
        groupId: tx?.groupId,
        recurringId: tx?.recurringId,
        instalment: tx?.instalment,
        createdAt: tx?.createdAt,
      });
      if (ruleMode) {
        await saveRecurring(editingRule, { tx: record, ...REPEATS[repeat ?? 'monthly'], day: date, auto });
      } else if (due) {
        saved = await addOccurrence(due.r, due.day, record, rateFor);
      } else if (instalPlan && account && isCreditCard(account)) {
        const feeNote = t('instalments.feeNote', { name: note.trim() || categoryName(category) });
        const options = toPlanOptions(instalPlan, account, expenseCats ?? [], feeNote);
        if (tx?.id) {
          saved = await saveTx(record, tx.id);
          await convertToPlan(saved, options);
        } else saved = await createPlan(record, options);
      } else if (withdrawal) {
        const bills = expenseCats?.find((c) => c.key === 'bills')?.id;
        saved = await saveWithCashFee(record, fee, { categoryId: bills, note: t('cards.cashFeeNote') });
      } else {
        saved = await saveTx(record, tx?.id);
        if (repeat && !linkedRule) await makeRecurring(saved, REPEATS[repeat], auto);
      }
    } catch (err) {
      saving.current = false;
      throw err;
    }

    try {
      localStorage.setItem(LAST_ACCOUNT_KEY, String(accountId));
    } catch {
      /* ignore */
    }
    Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
    onClose();
    if (saved) init.onSaved?.(saved);
  };

  const remove = () => {
    if (due) {
      void skipOccurrence(due.r, due.day);
      onClose();
      return;
    }
    presentAlert({
      header: t(editingRule ? 'recurring.stopTitle' : 'editor.deleteTitle'),
      message: t(editingRule ? 'recurring.stopMessage' : 'editor.deleteMessage'),
      buttons: [
        { text: t('common.cancel'), role: 'cancel' },
        {
          text: t(editingRule ? 'recurring.stop' : 'common.delete'),
          role: 'destructive',
          handler: async () => {
            if (editingRule) await stopRecurring(editingRule.id!);
            else if (tx?.id != null) await softDelete(db.transactions, [tx.id]);
            onClose();
          },
        },
      ],
    });
  };

  /** How often it repeats; on a transaction added from a recurring one, opens that instead. */
  const pickRepeat = () => {
    if (linkedRule) return openRule(linkedRule);
    const names = Object.keys(REPEATS) as RepeatName[];
    void presentSheet({
      header: t('recurring.repeat'),
      buttons: [
        // A recurring transaction stops from its delete button instead.
        ...(ruleMode ? [] : [{ text: t('recurring.never'), cssClass: repeat ? undefined : 'is-on', handler: () => setRepeat(null) }]),
        ...names.map((n) => ({ text: t(`recurring.every.${n}`), cssClass: repeat === n ? 'is-on' : undefined, handler: () => setRepeat(n) })),
        { text: t('common.cancel'), role: 'cancel' },
      ],
    });
  };

  const toggleAuto = () => {
    setAuto(!auto);
    void presentToast({ message: t(auto ? 'recurring.autoOff' : 'recurring.autoOn'), duration: 2600, position: 'top', color: 'medium' });
  };

  // The two coloured halves at the top: what the money leaves, and where it goes.
  type BoxItem = { name: string; icon: string; color: string };
  const accItem = (a?: Account): BoxItem | undefined => a && { name: accountName(a), icon: a.icon, color: a.color };
  const catItem = (c?: Category): BoxItem | undefined => c && { name: categoryName(c), icon: c.icon, color: c.color };
  const box = (side: Side, label: string, item: BoxItem | undefined, round: boolean) => (
    <button
      className={`b-ft b-ft--${side} ${picking === side ? 'is-picking' : ''}`}
      style={item ? { background: item.color } : undefined}
      onClick={() => {
        if (round && grouped) return void presentToast({ message: t('editor.groupCategory'), duration: 2200, position: 'top', color: 'medium' });
        setPicking(picking === side ? null : side);
      }}
    >
      {item && (
        <span className={`b-ft__badge ${round ? 'is-round' : ''}`} style={{ color: item.color }}>
          <IonIcon icon={iconFor(item.icon)} />
        </span>
      )}
      <small>{label}</small>
      <strong>{item ? item.name : t('editor.choose')}</strong>
    </button>
  );

  let fromBox: ReactNode;
  let toBox: ReactNode;
  if (type === 'expense') {
    fromBox = box('from', t('editor.fromAccount'), accItem(account), false);
    toBox = box('to', t('editor.toCategory'), catItem(category), true);
  } else if (type === 'income') {
    fromBox = box('from', t('editor.fromCategory'), catItem(category), true);
    toBox = box('to', t('editor.toAccount'), accItem(account), false);
  } else {
    fromBox = box('from', t('editor.fromAccount'), accItem(account), false);
    toBox = box('to', t('editor.toAccount'), accItem(toAccount), false);
  }

  // Which list the picker shows.
  const pickingAccounts =
    picking != null && (type === 'transfer' || (type === 'expense' && picking === 'from') || (type === 'income' && picking === 'to'));

  const pickAccount = (id: string) => {
    if (type === 'transfer' && picking === 'to') setToAccountId(id);
    else {
      accountChosen.current = true;
      setAccountId(id);
    }
    setPicking(null);
  };
  const pickCategory = (id: string) => {
    if (id !== categoryId) setSubcategoryId(undefined);
    setCategoryId(id);
    setPicking(null);
  };

  const selectedAccountId = type === 'transfer' && picking === 'to' ? toAccountId : accountId;

  // Category colour for expenses/income, so the label, amount and ✓ match the chosen category.
  const accent =
    type === 'transfer' ? 'var(--b-transfer)' : category?.color ?? (type === 'expense' ? 'var(--b-expense)' : 'var(--b-income)');

  // ── amount display ──
  const fromText = hasOperator(expr) ? expr : money.plain(amount, currency);
  const toText = toTouched && hasOperator(expr2) ? expr2 : money.plain(toAmount, toCurrency);
  const amt = (cur: string, text: string) => (
    <div className={`b-amt ${fitClass(cur + text)}`} dir="ltr">
      <span className="b-amt__cur">{cur}</span> <span className="b-amt__val b-num">{text}</span>
    </div>
  );

  // ── currency key: cycles the currency of the amount being typed ──
  const nextOf = (list: string[], cur: string) => list[(list.indexOf(cur) + 1) % list.length];
  const keyCurrencies = editingTo ? toCurs : fromCurs;
  const cycleCurrency = () => {
    if (editingTo) setToCurPick(nextOf(toCurs, toCurrency));
    else pickCurrency(nextOf(fromCurs, currency));
  };

  // Long-press ⌫ clears the whole amount.
  const holdTimer = useRef<number | undefined>(undefined);
  const startHold = () => {
    holdTimer.current = window.setTimeout(() => press('clear'), 500);
  };
  const endHold = () => window.clearTimeout(holdTimer.current);

  const dateLabel = useMemo(() => {
    const [y, m, d] = date.split('-').map(Number);
    const day = new Date(y, m - 1, d);
    const today = new Date();
    const full = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(day);
    if (isSameDay(day, today)) return `${t('period.today')}, ${full}`;
    if (isSameDay(day, addDays(today, -1))) return `${t('period.yesterday')}, ${full}`;
    return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(day);
  }, [date, locale, t]);

  const op = (k: string) => (
    <button key={k} className="b-key b-key--op" onClick={() => press(k)}>
      {k}
    </button>
  );
  const digit = (k: string) => (
    <button key={k} className="b-key" onClick={() => press(k)}>
      {k}
    </button>
  );

  return (
    <div className="b-editor" style={{ '--accent': accent } as CSSProperties}>
      {init.header != null && <div className="b-editor__header">{init.header}</div>}
      <div className="b-editor__sheet">
        <div className="b-fromto" {...tourAttr('editor.fromto')}>
          {fromBox}
          {toBox}
        </div>

        {/* A grouped transaction's subcategory, like its category, is the group's: it's changed there. */}
        {subcategories.length > 0 && !grouped && (
          <div className="b-subchips b-subchips--row" style={{ '--c': accent } as CSSProperties}>
            {subcategories.map((s) => (
              <button
                key={s.id}
                className={`b-subchip ${s.id === subcategoryId ? 'is-on' : ''}`}
                onClick={() => setSubcategoryId(s.id === subcategoryId ? undefined : s.id)}
              >
                <IonIcon icon={iconFor(s.icon)} />
                {s.name}
              </button>
            ))}
          </div>
        )}

        <div className="b-amount">
          <div className="b-typeline">
            <span />
            {types.length > 1 ? (
              <div className="b-typeswitch">
                {types.map((k) => (
                  <button key={k} className={type === k ? 'is-active' : ''} onClick={() => switchType(k)}>
                    {t(k === 'income' && back ? 'editor.moneyBack' : `type.${k}`)}
                  </button>
                ))}
              </div>
            ) : (
              <span className="b-typeline__label">{t(back ? 'editor.moneyBack' : `type.${type}`)}</span>
            )}
            {due ? (
              <button className="b-typeline__del b-typeline__skip" onClick={remove}>
                <IonIcon icon={playSkipForwardOutline} />
                <span>{t('recurring.skip')}</span>
              </button>
            ) : tx?.id != null || editingRule ? (
              <button className="b-typeline__del" onClick={remove} aria-label={t(editingRule ? 'recurring.stop' : 'common.delete')}>
                <IonIcon icon={trashOutline} />
              </button>
            ) : (
              <span />
            )}
          </div>

          {cross ? (
            <div className="b-amount__pair">
              <button className={`b-amount__side ${!editingTo ? 'is-active' : ''}`} onClick={() => focus('from')}>
                <small>{t('editor.sent')}</small>
                {amt(currency, fromText)}
              </button>
              <IonIcon icon={arrowForwardOutline} className="b-flip" />
              <button className={`b-amount__side ${editingTo ? 'is-active' : ''}`} onClick={() => focus('to')}>
                <small>{t('editor.received')}</small>
                {amt(toCurrency, toText)}
              </button>
            </div>
          ) : (
            amt(currency, fromText)
          )}
          {type === 'transfer' && !cross && toCurs.length > 1 && (
            <button className="b-tocur" onClick={() => setToCurPick(nextOf(toCurs, toCurrency))}>
              {t('editor.receivedIn', { currency: toCurrency })}
            </button>
          )}
          {/* A recurring transaction takes the saved rate on each day it's added, so it keeps none of its own. */}
          {(cross || (foreignAmount && !ruleMode)) && (
            <label className="b-rate b-rate--tx" dir="ltr">
              <span>1 {rateUnit} =</span>
              <input
                className="b-input b-num"
                inputMode="decimal"
                aria-label={t('accounts.rate')}
                placeholder={savedRate ? formatRate(savedRate) : '0'}
                value={rateValue}
                onChange={(e) => typeRate(e.target.value)}
              />
              <span>{rateQuote}</span>
            </label>
          )}
          {notHeld && account && (
            <p className="b-editor__hint">
              {t('editor.currencyNotHeld', { account: accountName(account), held: currenciesOf(account).join(' / ') })}
            </p>
          )}
        </div>

        <input
          className="b-note"
          {...tourAttr('editor.note')}
          placeholder={t('editor.notePlaceholder')}
          value={note}
          maxLength={120}
          onChange={(e) => setNote(e.target.value)}
        />

        {picking ? (
          <div className="b-picker">
            <div className="b-picker__grid">
              {pickingAccounts
                ? accounts?.map((a) => (
                    <Bubble
                      key={a.id}
                      className="b-picker__item"
                      name={accountName(a)}
                      icon={a.icon}
                      color={a.color}
                      amount={money.compact(balances?.get(a.id!)?.[a.currency] ?? 0)}
                      selected={a.id === selectedAccountId}
                      muted={type === 'transfer' && picking === 'to' && a.id === accountId && !a.currency2}
                      onClick={() => pickAccount(a.id!)}
                    />
                  ))
                : cats?.map((c) => (
                    <Bubble
                      key={c.id}
                      className="b-picker__item"
                      name={categoryName(c)}
                      icon={c.icon}
                      color={c.color}
                      selected={c.id === categoryId}
                      onClick={() => pickCategory(c.id!)}
                    />
                  ))}
            </div>
          </div>
        ) : (
          <div className="b-keypad" dir="ltr" {...tourAttr('editor.keypad')}>
            {op('÷')}
            {digit('7')}
            {digit('8')}
            {digit('9')}
            <button
              className="b-key b-key--op"
              onClick={() => press('back')}
              onPointerDown={startHold}
              onPointerUp={endHold}
              onPointerLeave={endHold}
              aria-label={t('editor.backspace')}
            >
              <IonIcon icon={backspaceOutline} />
            </button>
            {op('×')}
            {digit('4')}
            {digit('5')}
            {digit('6')}
            <button className="b-key b-key--op" {...tourAttr('editor.date')} onClick={() => setDateOpen(true)} aria-label={t('editor.date')}>
              <IonIcon icon={calendarOutline} />
            </button>
            {op('−')}
            {digit('1')}
            {digit('2')}
            {digit('3')}
            <button className="b-key b-key--save" onClick={save} aria-label={t('common.save')}>
              {anyPending ? '=' : <IonIcon icon={checkmarkOutline} />}
            </button>
            {op('+')}
            <button className="b-key b-key--op b-key--cur" disabled={keyCurrencies.length < 2} onClick={cycleCurrency}>
              {editingTo ? toCurrency : currency}
            </button>
            {digit('0')}
            {digit('.')}
          </div>
        )}

        <div className="b-editor__when">
          <button className="b-editor__date" onClick={() => setDateOpen(true)}>
            {ruleMode ? t('recurring.nextOn', { date: dateLabel }) : dateLabel}
          </button>
          {tx?.instalment && (
            <span className="b-editor__chip is-on">
              <IonIcon icon={albumsOutline} />
              {t('instalments.of', tx.instalment)}
            </span>
          )}
          {canInstal && !repeat && (
            <button className={`b-editor__chip ${instalPlan ? 'is-on' : ''}`} onClick={() => setPlanOpen(true)}>
              <IonIcon icon={albumsOutline} />
              {instalPlan ? instalmentChipLabel(t, instalPlan) : t('instalments.chip')}
            </button>
          )}
          {!due && !instalPlan && !tx?.instalment && (
            <button className={`b-editor__chip ${repeat || linkedRule ? 'is-on' : ''}`} onClick={pickRepeat}>
              <IonIcon icon={repeatOutline} />
              {linkedRule ? t(`recurring.every.${repeatOf(linkedRule)}`) : repeat ? t(`recurring.every.${repeat}`) : t('recurring.repeat')}
            </button>
          )}
          {repeat && !linkedRule && !due && (
            <button className={`b-editor__chip ${auto ? 'is-on' : ''}`} onClick={toggleAuto} aria-pressed={auto}>
              <IonIcon icon={flashOutline} />
              {t('recurring.auto')}
            </button>
          )}
          {withdrawal && (
            <button className={`b-editor__chip ${fee != null ? 'is-on' : ''}`} onClick={editFee}>
              <IonIcon icon={receiptOutline} />
              {fee != null ? t('cards.cashFeeChip', { amount: money.format(fee, currency) }) : t('cards.cashFeeAdd')}
            </button>
          )}
        </div>
        {withdrawal && <p className="b-editor__hint">{t('cards.cashInterestNote')}</p>}
      </div>

      {account && canInstal && (
        <InstalmentSheet
          isOpen={planOpen}
          amount={amount}
          currency={currency}
          card={account}
          accounts={accounts ?? []}
          value={plan}
          onDone={(v) => {
            setPlan(v);
            setPlanOpen(false);
          }}
          onClose={() => setPlanOpen(false)}
        />
      )}

      <IonModal className="b-date-modal" isOpen={dateOpen} onDidDismiss={() => setDateOpen(false)}>
        <IonDatetime
          presentation="date"
          locale={locale}
          value={date}
          onIonChange={(e) => {
            const v = e.detail.value;
            if (typeof v === 'string') setDate(v.slice(0, 10));
            setDateOpen(false);
          }}
        />
      </IonModal>
    </div>
  );
}
