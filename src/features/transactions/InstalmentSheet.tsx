import { useEffect, useState } from 'react';
import { IonModal, IonToggle } from '@ionic/react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useMoney } from '@/core/contexts/SettingsContext';
import { useNames } from '@/core/db/hooks';
import { isCreditCard, payFromAccount } from '@/core/utils/creditCard';
import { currenciesOf, groupOf, roundTo } from '@/core/utils/currency';
import { cleanNumberInput, parseNumber } from '@/core/utils/number';
import { MAX_MONTHS, MIN_MONTHS, parseFirst, parseMonths, planParts } from '@/features/accounts/card/instalments';
import type { Account } from '@/shared/models';
import { lastAccount } from './TransactionEditor';

/** What the user chose: how many months, a one-time fee, and the account that pays each instalment by itself. */
export interface InstalmentChoice {
  months: number;
  /** Set when the amount is one monthly instalment: which one it is (1..months). Unset: the amount is the full price. */
  first?: number;
  fee?: number;
  autoPayFrom?: string;
}

const DEFAULT_MONTHS = '12';
const DEFAULT_FIRST = '1';

/** The chip's text once instalments are chosen: "12 instalments", or "3 of 12" for one monthly instalment. */
export function instalmentChipLabel(t: TFunction, c: InstalmentChoice): string {
  return c.first != null ? t('instalments.chipFrom', { n: c.first, of: c.months }) : t('instalments.chipOn', { count: c.months });
}

interface Props {
  isOpen: boolean;
  /** The purchase's price, to show what each month comes to. */
  amount: number;
  currency: string;
  card: Account;
  accounts: Account[];
  value?: InstalmentChoice;
  /** The choice, or undefined for "Pay in full". */
  onDone: (v?: InstalmentChoice) => void;
  onClose: () => void;
}

/** Splits a credit card purchase into monthly instalments. */
export default function InstalmentSheet({ isOpen, amount, currency, card, accounts, value, onDone, onClose }: Props) {
  const { t } = useTranslation();
  const money = useMoney();
  const { accountName } = useNames();
  const [oneInstalment, setOneInstalment] = useState(false);
  const [months, setMonths] = useState(DEFAULT_MONTHS);
  const [first, setFirst] = useState(DEFAULT_FIRST);
  const [fee, setFee] = useState('');
  const [autoPay, setAutoPay] = useState(false);
  const [payFrom, setPayFrom] = useState<string>();

  // Accounts that can pay the card in its currency: not credit cards or debts.
  const payers = accounts.filter(
    (a) => a.id !== card.id && !a.archived && !isCreditCard(a) && groupOf(a) !== 'debt' && currenciesOf(a).includes(currency),
  );

  useEffect(() => {
    if (!isOpen) return;
    setOneInstalment(value?.first != null);
    setMonths(String(value?.months ?? DEFAULT_MONTHS));
    setFirst(String(value?.first ?? DEFAULT_FIRST));
    setFee(value?.fee ? String(value.fee) : '');
    setAutoPay(!!value?.autoPayFrom);
    setPayFrom(value?.autoPayFrom ?? payFromAccount(payers, card, lastAccount()));
    // Only when it opens: typing must not be reset by a new list of accounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const n = parseMonths(months);
  const k = oneInstalment ? parseFirst(first, n) : undefined;
  const valid = !!n && (!oneInstalment || k != null);
  // A plan that started before instalment 1 had its fee charged back then.
  const withFee = !oneInstalment || k === 1;
  let hint: string | undefined;
  if (!n) hint = t('instalments.monthsRange', { min: MIN_MONTHS, max: MAX_MONTHS });
  else if (!(amount > 0)) hint = undefined;
  else if (!oneInstalment) hint = t('instalments.perMonth', { amount: money.format(planParts(amount, n, currency)[0], currency) });
  else if (k != null) {
    hint = t('instalments.totalLeft', {
      total: money.format(roundTo(amount * n, currency), currency),
      left: money.format(roundTo(amount * (n - k), currency), currency),
    });
  }
  const done = () => {
    if (!n || !valid) return;
    const f = parseNumber(fee);
    onDone({ months: n, first: k, fee: withFee && f > 0 ? f : undefined, autoPayFrom: autoPay && payFrom ? payFrom : undefined });
  };

  return (
    <IonModal className="b-sheet-modal" isOpen={isOpen} breakpoints={[0, 1]} initialBreakpoint={1} handle={false} onDidDismiss={onClose}>
      <div className="b-sheet">
        <div className="b-sheet__head">
          <h2 className="b-card-sheet__title">{t('instalments.title')}</h2>
        </div>
        <div className="b-sheet__body">
          <div className="b-field">
            <span>{t('instalments.amountIs')}</span>
            <div className="b-tabs" role="tablist">
              {[false, true].map((one) => (
                <button
                  key={String(one)}
                  role="tab"
                  aria-selected={oneInstalment === one}
                  className={oneInstalment === one ? 'is-active' : ''}
                  onClick={() => setOneInstalment(one)}
                >
                  {t(one ? 'instalments.oneInstalment' : 'instalments.fullPrice')}
                </button>
              ))}
            </div>
          </div>
          {oneInstalment ? (
            <div className="b-field">
              <span>{t('instalments.which')}</span>
              <div className="b-instal-which">
                <input
                  className="b-input b-num"
                  inputMode="numeric"
                  aria-label={t('instalments.which')}
                  value={first}
                  onChange={(e) => setFirst(cleanNumberInput(e.target.value))}
                />
                <span>{t('instalments.ofSep')}</span>
                <input
                  className="b-input b-num"
                  inputMode="numeric"
                  aria-label={t('instalments.months')}
                  value={months}
                  onChange={(e) => setMonths(cleanNumberInput(e.target.value))}
                />
              </div>
            </div>
          ) : (
            <label className="b-field">
              <span>{t('instalments.months')}</span>
              <input className="b-input b-num" inputMode="numeric" value={months} onChange={(e) => setMonths(cleanNumberInput(e.target.value))} />
            </label>
          )}
          {hint && <div className="b-field-hint">{hint}</div>}
          {withFee && (
            <label className="b-field">
              <span>{t('instalments.fee', { currency })}</span>
              <input className="b-input b-num" inputMode="decimal" placeholder="0" value={fee} onChange={(e) => setFee(cleanNumberInput(e.target.value))} />
            </label>
          )}
          {!oneInstalment && <div className="b-field-hint">{t('instalments.interestHint')}</div>}
          {payers.length > 0 && (
            <>
              <div className="b-field">
                <IonToggle justify="space-between" checked={autoPay} onIonChange={(e) => setAutoPay(e.detail.checked)}>
                  {t('instalments.autoPay')}
                </IonToggle>
              </div>
              {autoPay && (
                <label className="b-field">
                  <select className="b-input" value={payFrom} onChange={(e) => setPayFrom(e.target.value)}>
                    {payers.map((a) => (
                      <option key={a.id} value={a.id}>
                        {accountName(a)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="b-field-hint">{t('instalments.autoPayHint')}</div>
            </>
          )}
        </div>
        <div className="b-sheet__foot">
          <button className="b-btn b-btn--muted" onClick={() => onDone(undefined)}>
            {t('instalments.off')}
          </button>
          <button className="b-btn b-btn--primary" disabled={!valid} onClick={done}>
            {t('instalments.done')}
          </button>
        </div>
      </div>
    </IonModal>
  );
}
