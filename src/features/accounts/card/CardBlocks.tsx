import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useConverter, useLocale, useMoney } from '@/core/contexts/SettingsContext';
import { currenciesOf } from '@/core/utils/currency';
import { REMIND_DAYS, type CardAmounts, type CardStatus } from '@/core/utils/creditCard';
import MoneyText from '@/shared/components/MoneyText';
import type { Account } from '@/shared/models';

/** The limit bar turns red from this share of the limit used. */
const NEAR_LIMIT = 0.9;

interface CardProps {
  account: Account;
  status: CardStatus;
}

/** Formats a date as "25 Oct" in the app's language. */
export function useDayMonth(): (d: Date) => string {
  const locale = useLocale();
  return (d) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(d);
}

/** An amount for each of the card's currencies: always the main one, the second only when it isn't zero. */
export function AmountLines({ account, status, pick }: CardProps & { pick: (x: CardAmounts) => number | undefined }) {
  const money = useMoney();
  const shown = currenciesOf(account).filter((c) => c === account.currency || (pick(status.byCurrency[c]) ?? 0) > 0);
  return (
    <>
      {shown.map((c) => (
        <span key={c} className="b-group__line">
          <MoneyText currency={c} text={money.plain(pick(status.byCurrency[c]) ?? 0, c)} />
        </span>
      ))}
    </>
  );
}

export function CcRow({ label, strong, children }: { label: string; strong?: boolean; children: ReactNode }) {
  return (
    <div className={`b-cc__row ${strong ? 'is-strong' : ''}`}>
      <span>{label}</span>
      <span className="b-num">{children}</span>
    </div>
  );
}

/** What's owed now, against the limit when one is set. */
export function OwedBlock({ account, status }: CardProps) {
  const { t } = useTranslation();
  const money = useMoney();
  const conv = useConverter();
  const main = account.currency;
  const others = currenciesOf(account).filter((c) => c !== main);
  // One limit covers every currency on the card, so the second one counts at the saved rate.
  const used =
    status.byCurrency[main].owed + others.reduce((s, c) => s + (conv.convert(status.byCurrency[c].owed, c, main) ?? 0), 0);
  const limit = account.credit?.limit;
  const share = limit ? used / limit : 0;
  return (
    <div className="b-card b-cc">
      <div className="b-cc__label">{t('cards.owedNowTitle')}</div>
      <div className={`b-cc__big b-num ${used > 0 ? 'b-expense' : ''}`}>
        <AmountLines account={account} status={status} pick={(x) => x.owed} />
      </div>
      {limit ? (
        <>
          <div className="b-bar" style={{ margin: '12px 0 8px' }}>
            <span
              style={{
                width: `${Math.min(100, share * 100)}%`,
                background: share >= NEAR_LIMIT ? 'var(--b-expense)' : 'var(--ion-color-primary)',
              }}
            />
          </div>
          <div className="b-cc__split b-num">
            <span className={used > limit ? 'b-expense' : ''}>
              {used > limit
                ? t('cards.overLimit', { amount: money.format(used - limit, main) })
                : t('cards.available', { amount: money.format(limit - used, main) })}
            </span>
            <span className="b-muted">{t('cards.limitOf', { amount: money.format(limit, main) })}</span>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** The last statement: its balance, what's been paid since, what's left, the minimum and when it's due. */
export function StatementRows({ account, status }: CardProps) {
  const { t } = useTranslation();
  const lines = (pick: (x: CardAmounts) => number | undefined) => <AmountLines account={account} status={status} pick={pick} />;
  return (
    <>
      <CcRow label={t('cards.statementBalance')}>{lines((x) => x.statement)}</CcRow>
      <CcRow label={t('cards.paidSince')}>{lines((x) => x.paid)}</CcRow>
      <CcRow label={t('cards.leftToPay')} strong>{lines((x) => x.due)}</CcRow>
      {status.byCurrency[account.currency].minimum != null && (
        <CcRow label={t('cards.minimumLeft')}>{lines((x) => x.minimum)}</CcRow>
      )}
      <DueLine status={status} />
    </>
  );
}

/** The cycle running now: what's been spent, what the next statement holds so far, and when it's due. */
export function CycleRows({ account, status }: CardProps) {
  const { t } = useTranslation();
  const dayMonth = useDayMonth();
  const lines = (pick: (x: CardAmounts) => number | undefined) => <AmountLines account={account} status={status} pick={pick} />;
  // What's owed now is what the next statement would show; worth its own line only when old debt is in it.
  const carried = Object.values(status.byCurrency).some((x) => x.owed !== x.spent);
  return (
    <div className="b-cc__cycle">
      <CcRow label={t('cards.spentSoFar')}>{lines((x) => x.spent)}</CcRow>
      {carried && <CcRow label={t('cards.nextSoFar')}>{lines((x) => x.owed)}</CcRow>}
      <div className="b-muted b-cc__next">
        {t('cards.nextStatementDue', { date: dayMonth(status.cycle.nextStatementOn), due: dayMonth(status.cycle.nextDueOn) })}
      </div>
    </div>
  );
}

/** "This cycle · 6 Nov – 5 Dec" */
export function useCycleTitle(): (status: CardStatus) => string {
  const { t } = useTranslation();
  const dayMonth = useDayMonth();
  return (s) => {
    const from = new Date(s.cycle.statementOn.getFullYear(), s.cycle.statementOn.getMonth(), s.cycle.statementOn.getDate() + 1);
    return t('cards.thisCycle', { from: dayMonth(from), to: dayMonth(s.cycle.nextStatementOn) });
  };
}

/** When the statement is due, or that it's paid. */
function DueLine({ status }: { status: CardStatus }) {
  const { t } = useTranslation();
  const date = useDayMonth()(status.cycle.dueOn);
  const { state, daysLeft } = status;
  const [text, tone] =
    state === 'overdue' ? [t('cards.overdue', { count: -daysLeft, date }), 'b-expense']
    : state === 'due' ? [daysLeft === 0 ? t('cards.dueToday') : t('cards.dueIn', { count: daysLeft, date }), daysLeft <= REMIND_DAYS ? 'b-warn' : '']
    : state === 'paid' ? [t('cards.paid'), 'b-income']
    : [t('cards.clear'), 'b-muted'];
  return <div className={`b-cc__due ${tone}`}>{text}</div>;
}
