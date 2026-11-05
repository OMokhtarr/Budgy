import { useState, type ReactNode } from 'react';
import { IonButton, IonContent, IonHeader, IonIcon, IonPage, IonToolbar } from '@ionic/react';
import { addOutline, calculatorOutline, cashOutline, swapHorizontalOutline, swapVerticalOutline, walletOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { useConverter, useMoney, useSettings } from '@/core/contexts/SettingsContext';
import { useTxEditor } from '@/core/contexts/TxEditorContext';
import { useAccounts, useBalances, useNames } from '@/core/db/hooks';
import { addAmounts, currenciesOf, groupOf, linesOf, roundTo } from '@/core/utils/currency';
import { assetsAndDebts } from '@/core/utils/finances';
import AppHeader from '@/shared/components/AppHeader';
import Avatar from '@/shared/components/Avatar';
import MoneyText from '@/shared/components/MoneyText';
import { useSwipe } from '@/shared/hooks/useSwipe';
import AccountEditModal from './AccountEditModal';
import type { Account, AccountGroup, Amounts } from '@/shared/models';

type Tab = 'accounts' | 'debts' | 'finances';
/** An account being edited, or a new one to create in the given group. */
type Editing = Account | { newGroup: AccountGroup };

export default function AccountsPage() {
  const { t } = useTranslation();
  const money = useMoney();
  const conv = useConverter();
  const { balanceView, update } = useSettings();
  const openEditor = useTxEditor();
  const { accountName } = useNames();
  const accounts = useAccounts();
  const archived = (useAccounts(true) ?? []).filter((a) => a.archived);
  const balances = useBalances();
  const [tab, setTab] = useState<Tab>('accounts');
  const [editing, setEditing] = useState<Editing | null>(null);

  const all = accounts ?? [];
  const inGroup = (g: AccountGroup) => all.filter((a) => groupOf(a) === g);
  const split = balanceView === 'split';
  const byBaseFirst = ([a]: [string, number], [b]: [string, number]) =>
    a === conv.base ? -1 : b === conv.base ? 1 : a.localeCompare(b);

  /** A total in the main currency (Sum) or one line per currency (Split). */
  const totalOf = (amounts: Amounts): ReactNode => {
    if (!split) {
      const s = conv.sum(amounts);
      return <MoneyText currency={conv.base} text={money.plain(s.value)} />;
    }
    const lines = Object.entries(amounts).filter(([, n]) => n !== 0).sort(byBaseFirst);
    return (lines.length ? lines : [[conv.base, 0] as [string, number]]).map(([c, n]) => (
      <span key={c} className="b-group__line">
        <MoneyText currency={c} text={money.plain(n, c)} />
      </span>
    ));
  };

  /** An account's balance in its own currency: added up (Sum) or one line per currency (Split). */
  const accountLines = (a: Account): [string, number][] => {
    const lines = linesOf(a, balances?.get(a.id!));
    const summed = conv.sum(Object.fromEntries(lines), a.currency);
    return !split && summed.missing.length === 0 ? [[a.currency, summed.value]] : lines;
  };

  const row = (a: Account, tone?: 'owed' | 'owe') => {
    const [[cur, bal], ...rest] = accountLines(a);
    const color = tone === 'owed' ? 'b-income' : tone === 'owe' || bal < 0 ? 'b-expense' : '';
    return (
      <button key={a.id} className="b-row" onClick={() => setEditing(a)}>
        <Avatar icon={a.icon} color={a.color} square />
        <div className="b-row__main">
          <div className="b-row__title">{accountName(a)}</div>
          <div className="b-row__sub">
            {t(`accountType.${a.type}`)}
            {a.currency2 && ` · ${a.currency} + ${a.currency2}`}
          </div>
        </div>
        <div className={`b-row__amount b-num ${color}`}>
          <MoneyText currency={cur} text={money.plain(tone ? Math.abs(bal) : bal, cur)} />
          {rest.map(([c, n]) => (
            <small key={c}>
              <MoneyText currency={c} text={money.plain(n, c)} />
            </small>
          ))}
        </div>
      </button>
    );
  };

  const group = (title: string, list: Account[], total: ReactNode, tone?: 'owed' | 'owe') =>
    list.length > 0 && (
      <section className="b-group">
        <div className="b-group__head">
          <span>{title}</span>
          <span className={`b-num ${tone === 'owed' ? 'b-income' : tone === 'owe' ? 'b-expense' : ''}`}>{total}</span>
        </div>
        <div className="b-card" style={{ overflow: 'hidden' }}>
          {list.map((a) => row(a, tone))}
        </div>
      </section>
    );

  // ── Accounts tab ──
  const regular = inGroup('regular');
  const savings = inGroup('savings');
  const multiCurrency = all.some((a) => a.currency !== conv.base || a.currency2);
  const firstDual = all.find((a) => currenciesOf(a).length > 1);
  const amountsOf = (list: Account[]) => addAmounts(list.map((a) => balances?.get(a.id!)));

  // ── Debts tab: each debt account's balance in its own currency decides who owes whom ──
  const debts = inGroup('debt').map((a) => {
    const lines = linesOf(a, balances?.get(a.id!));
    const s = conv.sum(Object.fromEntries(lines), a.currency);
    return { a, value: s.missing.length ? lines[0][1] : s.value };
  });
  const owed = debts.filter((d) => d.value > 0);
  const owe = debts.filter((d) => d.value < 0);
  const settled = debts.filter((d) => d.value === 0);
  const debtTotal = (list: typeof debts) =>
    money.plain(Math.abs(list.reduce((s, d) => s + conv.toBase(d.value, d.a.currency), 0)));

  // ── My finances: every positive balance is an asset, every negative one a debt ──
  const { assets, debts: liabilities } = assetsAndDebts(all, balances);
  const finCurrencies = [...new Set([conv.base, ...Object.keys(assets), ...Object.keys(liabilities)])].sort((a, b) =>
    byBaseFirst([a, 0], [b, 0]),
  );
  const assetsSum = conv.sum(assets);
  const liabilitiesSum = conv.sum(liabilities);
  const net = roundTo(assetsSum.value - liabilitiesSum.value, conv.base);

  const tabs: { key: Tab; icon: string }[] = [
    { key: 'accounts', icon: walletOutline },
    { key: 'debts', icon: swapVerticalOutline },
    { key: 'finances', icon: calculatorOutline },
  ];
  const tabIndex = tabs.findIndex((x) => x.key === tab);
  const contentRef = useSwipe(
    tabIndex > 0 ? () => setTab(tabs[tabIndex - 1].key) : undefined,
    tabIndex < tabs.length - 1 ? () => setTab(tabs[tabIndex + 1].key) : undefined,
  );

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <AppHeader
          end={
            <IonButton onClick={() => setEditing({ newGroup: tab === 'debts' ? 'debt' : 'regular' })} aria-label={t('accounts.add')}>
              <IonIcon slot="icon-only" icon={addOutline} />
            </IonButton>
          }
        />
        <IonToolbar className="b-toolbar">
          <div className="b-tabs" role="tablist">
            {tabs.map((x) => (
              <button key={x.key} role="tab" aria-selected={tab === x.key} className={tab === x.key ? 'is-active' : ''} onClick={() => setTab(x.key)}>
                <IonIcon icon={x.icon} />
                {t(`accounts.tabs.${x.key}`)}
              </button>
            ))}
          </div>
        </IonToolbar>
      </IonHeader>

      <IonContent ref={contentRef}>
        <div className="b-page">
          {tab === 'accounts' && (
            <>
              <div className="b-actions">
                <button className="b-btn b-btn--muted" onClick={() => openEditor({ type: 'transfer' })}>
                  <IonIcon icon={swapHorizontalOutline} />
                  {t('accounts.transfer')}
                </button>
                {firstDual && (
                  <button className="b-btn b-btn--muted" onClick={() => openEditor({ type: 'transfer', accountId: firstDual.id, toAccountId: firstDual.id })}>
                    <IonIcon icon={cashOutline} />
                    {t('accounts.exchangeShort')}
                  </button>
                )}
                {multiCurrency && (
                  <div className="b-typeswitch" role="group" aria-label={t('accounts.view')}>
                    <button className={!split ? 'is-active' : ''} onClick={() => update({ balanceView: 'sum' })}>
                      {t('accounts.sum')}
                    </button>
                    <button className={split ? 'is-active' : ''} onClick={() => update({ balanceView: 'split' })}>
                      {t('accounts.split')}
                    </button>
                  </div>
                )}
              </div>
              {accounts && regular.length + savings.length === 0 && (
                <div className="b-empty">
                  <IonIcon icon={walletOutline} />
                  {t('accounts.empty')}
                </div>
              )}
              {group(t('filter.group.regular'), regular, totalOf(amountsOf(regular)))}
              {group(t('accounts.savings'), savings, totalOf(amountsOf(savings)))}
              <div className="b-archived">{group(t('accounts.archived'), archived, null)}</div>
            </>
          )}

          {tab === 'debts' && (
            <>
              {debts.length === 0 ? (
                <div className="b-empty">
                  <IonIcon icon={swapVerticalOutline} />
                  {t('debts.empty')}
                  <button className="b-btn b-btn--primary" style={{ marginTop: 14 }} onClick={() => setEditing({ newGroup: 'debt' })}>
                    <IonIcon icon={addOutline} />
                    {t('debts.add')}
                  </button>
                </div>
              ) : (
                <>
                  {group(t('debts.owed'), owed.map((d) => d.a), <MoneyText currency={conv.base} text={debtTotal(owed)} />, 'owed')}
                  {group(t('debts.owe'), owe.map((d) => d.a), <MoneyText currency={conv.base} text={debtTotal(owe)} />, 'owe')}
                  {group(t('debts.settled'), settled.map((d) => d.a), null)}
                  <p className="b-muted b-hint">{t('debts.hint')}</p>
                </>
              )}
            </>
          )}

          {tab === 'finances' && (
            <>
              <div className="b-section-title">{t('accounts.tabs.finances')}</div>
              <div className="b-fin">
                <div className="b-fin__cell b-fin__corner" />
                <div className="b-fin__cell b-fin__colhead">{t('finances.assets')}</div>
                <div className="b-fin__cell b-fin__colhead">{t('finances.debts')}</div>
                {finCurrencies.map((c) => (
                  <FinRow key={c} label={c}>
                    <MoneyText currency={c} text={money.plain(assets[c] ?? 0, c)} />
                    <MoneyText currency={c} text={money.plain(liabilities[c] ?? 0, c)} />
                  </FinRow>
                ))}
                {finCurrencies.length > 1 && (
                  <FinRow label="=">
                    <MoneyText currency={conv.base} text={money.plain(assetsSum.value)} />
                    <MoneyText currency={conv.base} text={money.plain(liabilitiesSum.value)} />
                  </FinRow>
                )}
                <div className={`b-fin__cell b-fin__net b-num ${net < 0 ? 'b-expense' : 'b-income'}`}>
                  <small>{t('finances.net')}</small>
                  <MoneyText currency={conv.base} text={money.plain(net)} />
                </div>
              </div>
              <p className="b-muted b-hint">{t('finances.hint')}</p>
            </>
          )}
        </div>
      </IonContent>

      <AccountEditModal
        isOpen={editing != null}
        account={editing && 'id' in editing ? editing : undefined}
        newGroup={editing && 'newGroup' in editing ? editing.newGroup : undefined}
        onClose={() => setEditing(null)}
      />
    </IonPage>
  );
}

/** One currency row of the My finances table: label, assets, debts. */
function FinRow({ label, children }: { label: string; children: [ReactNode, ReactNode] }) {
  return (
    <>
      <div className="b-fin__cell b-fin__rowhead">{label}</div>
      <div className="b-fin__cell b-num b-income">{children[0]}</div>
      <div className="b-fin__cell b-num b-expense">{children[1]}</div>
    </>
  );
}
