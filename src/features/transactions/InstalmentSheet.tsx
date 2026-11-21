import { useEffect, useState } from 'react';
import { IonModal, IonToggle } from '@ionic/react';
import { useTranslation } from 'react-i18next';
import { useMoney } from '@/core/contexts/SettingsContext';
import { useNames } from '@/core/db/hooks';
import { isCreditCard, payFromAccount } from '@/core/utils/creditCard';
import { currenciesOf, groupOf } from '@/core/utils/currency';
import { cleanNumberInput, parseNumber } from '@/core/utils/number';
import { MAX_MONTHS, MIN_MONTHS, parseMonths, splitAmount } from '@/features/accounts/card/instalments';
import type { Account } from '@/shared/models';
import { lastAccount } from './TransactionEditor';

/** What the user chose: how many months, a one-time fee, and the account that pays each instalment by itself. */
export interface InstalmentChoice {
  months: number;
  fee?: number;
  autoPayFrom?: string;
}

const DEFAULT_MONTHS = '12';

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
  const [months, setMonths] = useState(DEFAULT_MONTHS);
  const [fee, setFee] = useState('');
  const [autoPay, setAutoPay] = useState(false);
  const [payFrom, setPayFrom] = useState<string>();

  // Accounts that can pay the card in its currency: not credit cards or debts.
  const payers = accounts.filter(
    (a) => a.id !== card.id && !a.archived && !isCreditCard(a) && groupOf(a) !== 'debt' && currenciesOf(a).includes(currency),
  );

  useEffect(() => {
    if (!isOpen) return;
    setMonths(String(value?.months ?? DEFAULT_MONTHS));
    setFee(value?.fee ? String(value.fee) : '');
    setAutoPay(!!value?.autoPayFrom);
    setPayFrom(value?.autoPayFrom ?? payFromAccount(payers, card, lastAccount()));
    // Only when it opens: typing must not be reset by a new list of accounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const n = parseMonths(months);
  const perMonth = n && amount > 0 ? splitAmount(amount, n, currency)[0] : undefined;
  const done = () => {
    if (!n) return;
    const f = parseNumber(fee);
    onDone({ months: n, fee: f > 0 ? f : undefined, autoPayFrom: autoPay && payFrom ? payFrom : undefined });
  };

  return (
    <IonModal className="b-sheet-modal" isOpen={isOpen} breakpoints={[0, 1]} initialBreakpoint={1} handle={false} onDidDismiss={onClose}>
      <div className="b-sheet">
        <div className="b-sheet__head">
          <h2 className="b-card-sheet__title">{t('instalments.title')}</h2>
        </div>
        <div className="b-sheet__body">
          <label className="b-field">
            <span>{t('instalments.months')}</span>
            <input className="b-input b-num" inputMode="numeric" value={months} onChange={(e) => setMonths(cleanNumberInput(e.target.value))} />
          </label>
          <div className="b-field-hint">
            {perMonth != null
              ? t('instalments.perMonth', { amount: money.format(perMonth, currency) })
              : t('instalments.monthsRange', { min: MIN_MONTHS, max: MAX_MONTHS })}
          </div>
          <label className="b-field">
            <span>{t('instalments.fee', { currency })}</span>
            <input className="b-input b-num" inputMode="decimal" placeholder="0" value={fee} onChange={(e) => setFee(cleanNumberInput(e.target.value))} />
          </label>
          <div className="b-field-hint">{t('instalments.interestHint')}</div>
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
          <button className="b-btn b-btn--primary" disabled={!n} onClick={done}>
            {t('instalments.done')}
          </button>
        </div>
      </div>
    </IonModal>
  );
}
