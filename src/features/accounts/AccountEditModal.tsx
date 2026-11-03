import { useEffect, useState } from 'react';
import {
  IonButton, IonButtons, IonContent, IonHeader, IonModal, IonTitle, IonToolbar, useIonAlert,
} from '@ionic/react';
import { useTranslation } from 'react-i18next';
import { alive, db, softDelete } from '@/core/db/db';
import { useBalances, useNames } from '@/core/db/hooks';
import { CURRENCIES, useSettings } from '@/core/contexts/SettingsContext';
import { currenciesOf, openingOf, roundTo } from '@/core/utils/currency';
import { cleanNumberInput, parseNumber } from '@/core/utils/number';
import IconColorPicker from '@/shared/components/IconColorPicker';
import Avatar from '@/shared/components/Avatar';
import RateInput from '@/shared/components/RateInput';
import type { Account, AccountGroup, AccountType } from '@/shared/models';

/** The currency list, plus `current` if it isn't in it (e.g. from a restored backup). */
function currencyOptions(current: string): string[] {
  return current && !CURRENCIES.includes(current) ? [current, ...CURRENCIES] : CURRENCIES;
}

const TYPES: { type: AccountType; icon: string }[] = [
  { type: 'cash', icon: 'cash' },
  { type: 'card', icon: 'card' },
  { type: 'bank', icon: 'business' },
  { type: 'savings', icon: 'trending' },
  { type: 'wallet', icon: 'wallet' },
];

interface Props {
  isOpen: boolean;
  account?: Account;
  /** Group for a new account, e.g. 'debt' when added from the Debts tab. */
  newGroup?: AccountGroup;
  onClose: () => void;
}

const GROUPS: AccountGroup[] = ['regular', 'savings', 'debt'];

export default function AccountEditModal({ isOpen, account, newGroup, onClose }: Props) {
  const { t } = useTranslation();
  const { currency: base } = useSettings();
  const { accountName } = useNames();
  const balances = useBalances();
  const [presentAlert] = useIonAlert();

  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('cash');
  const [icon, setIcon] = useState('cash');
  const [color, setColor] = useState('#10b981');
  const [currency, setCurrency] = useState(base);
  /** '' = the account holds a single currency. */
  const [currency2, setCurrency2] = useState('');
  const [balance, setBalance] = useState('');
  const [balance2, setBalance2] = useState('');
  const [group, setGroup] = useState<AccountGroup>('regular');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setLoaded(false);
      return;
    }
    if (loaded || !balances) return;
    setName(account ? accountName(account) : '');
    setType(account?.type ?? 'cash');
    setIcon(account?.icon ?? 'cash');
    setColor(account?.color ?? '#3b82f6');
    const cur = account?.currency ?? base;
    const cur2 = account?.currency2 ?? '';
    setCurrency(cur);
    setCurrency2(cur2);
    setBalance(account ? String(balances.get(account.id!)?.[cur] ?? 0) : '');
    setBalance2(account && cur2 ? String(balances.get(account.id!)?.[cur2] ?? 0) : '');
    setGroup(account?.group ?? newGroup ?? 'regular');
    setLoaded(true);
  }, [isOpen, account, newGroup, accountName, balances, loaded, base]);

  const current = (account && balances?.get(account.id!)) || {};
  // Switching a currency shows the balance the account already has in it (0 for a new one).
  const pickCurrency = (c: string) => {
    setCurrency(c);
    if (account) setBalance(String(current[c] ?? 0));
    if (c === currency2) setCurrency2('');
  };
  const pickCurrency2 = (c: string) => {
    setCurrency2(c);
    setBalance2(account && c ? String(current[c] ?? 0) : '');
  };

  const save = async () => {
    if (!name.trim()) return;
    // Dropping a currency that transactions use leaves them in it, so make sure that's intended.
    const removed = account ? currenciesOf(account).filter((c) => c !== currency && c !== currency2) : [];
    if (account?.id != null && removed.length) {
      const id = account.id;
      const used =
        (await db.transactions.where('accountId').equals(id).filter((x) => alive(x) && removed.includes(x.currency)).count()) +
        (await db.transactions.where('toAccountId').equals(id).filter((x) => alive(x) && removed.includes(x.toCurrency ?? x.currency)).count());
      if (used) {
        presentAlert({
          header: t('accounts.currencyChangeTitle'),
          message: t('accounts.currencyChangeMessage', { count: used, list: removed.join(', ') }),
          buttons: [
            { text: t('common.cancel'), role: 'cancel' },
            { text: t('accounts.currencyChange'), handler: () => void commit() },
          ],
        });
        return;
      }
    }
    await commit();
  };

  const commit = async () => {
    const trimmed = name.trim();
    // The user edits the *current* balance per currency; we store the opening balance that produces it.
    const opening = account ? openingOf(account) : {};
    const openingFor = (cur: string, typed: string) => {
      const movements = (current[cur] ?? 0) - (opening[cur] ?? 0);
      return roundTo((parseNumber(typed) || 0) - movements, cur);
    };
    const patch = {
      name: account && !account.name && trimmed === accountName(account) ? '' : trimmed,
      type,
      icon,
      color,
      currency,
      currency2: currency2 || undefined,
      initialBalance: openingFor(currency, balance),
      initialBalance2: currency2 ? openingFor(currency2, balance2) : undefined,
      group: group === 'regular' ? undefined : group,
    };
    if (account?.id != null) await db.accounts.update(account.id, patch);
    else await db.accounts.add({ ...patch, order: await db.accounts.count(), createdAt: new Date().toISOString() });
    onClose();
  };

  /** Archived accounts disappear from lists, pickers and the filter but keep their history. */
  const setArchived = async (archived: boolean) => {
    if (account?.id == null) return;
    await db.accounts.update(account.id, { archived: archived || undefined });
    onClose();
  };

  const remove = async () => {
    if (account?.id == null) return;
    const id = account.id;
    const txs = await db.transactions.where('accountId').equals(id).or('toAccountId').equals(id).filter(alive).toArray();
    // Transfers with other accounts go too, which changes those accounts' balances; archiving keeps them.
    const transfers = txs.filter((x) => x.type === 'transfer' && (x.accountId !== id || x.toAccountId !== id)).length;
    const message = !txs.length
      ? t('accounts.deleteMessage')
      : [t('accounts.deleteUsed', { count: txs.length }), transfers ? t('accounts.deleteTransfers', { count: transfers }) : '']
          .filter(Boolean)
          .join(' ');
    presentAlert({
      header: t('accounts.deleteTitle'),
      message,
      buttons: [
        { text: t('common.cancel'), role: 'cancel' },
        ...(transfers && !account.archived ? [{ text: t('accounts.archive'), handler: () => void setArchived(true) }] : []),
        {
          text: t('common.delete'),
          role: 'destructive',
          handler: async () => {
            await db.transaction('rw', db.accounts, db.transactions, async () => {
              await softDelete(db.transactions, txs.map((x) => x.id!));
              await softDelete(db.accounts, [id]);
            });
            onClose();
          },
        },
      ],
    });
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose}>
      <IonHeader>
        <IonToolbar className="b-toolbar">
          <IonButtons slot="start">
            <IonButton onClick={onClose}>{t('common.cancel')}</IonButton>
          </IonButtons>
          <IonTitle>{account ? t('accounts.editTitle') : t('accounts.newTitle')}</IonTitle>
          <IonButtons slot="end">
            <IonButton strong onClick={save} disabled={!name.trim()}>
              {t('common.save')}
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <div className="b-page" style={{ paddingTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
            <div style={{ transform: 'scale(1.6)' }}>
              <Avatar icon={icon} color={color} square />
            </div>
          </div>
          <label className="b-field">
            <span>{t('editor.name')}</span>
            <input className="b-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} autoFocus={!account} />
          </label>
          <div className="b-field">
            <span>{t('accounts.type')}</span>
            <div className="b-pills" style={{ flexWrap: 'wrap' }}>
              {TYPES.map((x) => (
                <button
                  key={x.type}
                  className={type === x.type ? 'is-active' : ''}
                  onClick={() => {
                    setType(x.type);
                    setIcon(x.icon);
                  }}
                >
                  {t(`accountType.${x.type}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="b-field">
            <span>{t('accounts.group')}</span>
            <div className="b-pills">
              {GROUPS.map((g) => (
                <button key={g} className={group === g ? 'is-active' : ''} onClick={() => setGroup(g)}>
                  {t(`accounts.groups.${g}`)}
                </button>
              ))}
            </div>
            <div className="b-muted" style={{ fontSize: 12.5, margin: '6px 4px 0' }}>{t(`accounts.groupHint.${group}`)}</div>
          </div>
          <div className="b-field-row">
            <label className="b-field">
              <span>{t('accounts.currency')}</span>
              <select className="b-input" value={currency} onChange={(e) => pickCurrency(e.target.value)}>
                {currencyOptions(currency).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="b-field">
              <span>{t('accounts.currentBalance', { currency })}</span>
              <input
                className="b-input b-num"
                inputMode="decimal"
                placeholder="0"
                value={balance}
                onChange={(e) => setBalance(cleanNumberInput(e.target.value, true))}
              />
            </label>
          </div>
          <div className="b-field-row">
            <label className="b-field">
              <span>{t('accounts.currency2')}</span>
              <select className="b-input" value={currency2} onChange={(e) => pickCurrency2(e.target.value)}>
                <option value="">{t('accounts.none')}</option>
                {currencyOptions(currency2).filter((c) => c !== currency).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            {currency2 && (
              <label className="b-field">
                <span>{t('accounts.currentBalance', { currency: currency2 })}</span>
                <input
                  className="b-input b-num"
                  inputMode="decimal"
                  placeholder="0"
                  value={balance2}
                  onChange={(e) => setBalance2(cleanNumberInput(e.target.value, true))}
                />
              </label>
            )}
          </div>
          {[currency, currency2].filter((c) => c && c !== base).map((c) => (
            <div key={c} className="b-field">
              <span>{t('accounts.rate')}</span>
              <RateInput currency={c} />
            </div>
          ))}
          <IconColorPicker icon={icon} color={color} onIcon={setIcon} onColor={setColor} />
          {account && (
            <>
              <IonButton expand="block" fill="clear" color="medium" onClick={() => setArchived(!account.archived)} style={{ marginTop: 12 }}>
                {account.archived ? t('accounts.restore') : t('accounts.archive')}
              </IonButton>
              <IonButton expand="block" fill="clear" color="danger" onClick={remove}>
                {t('accounts.delete')}
              </IonButton>
            </>
          )}
        </div>
      </IonContent>
    </IonModal>
  );
}
