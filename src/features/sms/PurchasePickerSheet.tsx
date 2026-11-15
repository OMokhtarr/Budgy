import { useMemo, useState } from 'react';
import { IonIcon, IonModal, IonSearchbar } from '@ionic/react';
import { closeOutline, receiptOutline } from 'ionicons/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { useLocale, useMoney } from '@/core/contexts/SettingsContext';
import { useLookups, useNames } from '@/core/db/hooks';
import { dayTimeLabel } from '@/core/utils/period';
import Avatar from '@/shared/components/Avatar';
import MoneyText from '@/shared/components/MoneyText';
import type { Transaction } from '@/shared/models';
import { recentExpenses } from './grouping';

/** How far back the purchases to take money off go. */
const DAYS = 30;

interface Props {
  isOpen: boolean;
  onPick(tx: Transaction): void;
  onClose(): void;
}

/** The purchases of the last 30 days, newest first, with a search: pick the one money came back on. */
export default function PurchasePickerSheet({ isOpen, onPick, onClose }: Props) {
  const { t } = useTranslation();
  const money = useMoney();
  const locale = useLocale();
  const { accounts, categories } = useLookups();
  const { accountName, categoryName } = useNames();
  const [query, setQuery] = useState('');
  const purchases = useLiveQuery(() => (isOpen ? recentExpenses(DAYS) : Promise.resolve([])), [isOpen]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return purchases ?? [];
    return (purchases ?? []).filter((x) =>
      [x.note, categoryName(categories.get(x.categoryId!)), accountName(accounts.get(x.accountId)), String(x.amount)].join(' ').toLowerCase().includes(q),
    );
  }, [purchases, query, categories, accounts, categoryName, accountName]);

  return (
    <IonModal className="b-sheet-modal" isOpen={isOpen} breakpoints={[0, 1]} initialBreakpoint={1} handle={false} onDidDismiss={onClose}>
      <div className="b-sheet">
        <div className="b-sheet__head">
          <button className="b-iconbtn" onClick={onClose} aria-label={t('common.close')}>
            <IonIcon icon={closeOutline} />
          </button>
          <h2>{t('sms.pickPurchase')}</h2>
        </div>
        <div className="b-sheet__body">
          <IonSearchbar className="b-search" value={query} debounce={150} placeholder={t('sms.searchPurchases')} onIonInput={(e) => setQuery(e.detail.value ?? '')} />
          {purchases && shown.length === 0 && (
            <div className="b-empty">
              <IonIcon icon={receiptOutline} />
              {t('sms.noPurchases', { count: DAYS })}
            </div>
          )}
          {shown.map((x) => {
            const cat = categories.get(x.categoryId!);
            const when = dayTimeLabel(new Date(x.date), locale, { today: t('period.today'), yesterday: t('period.yesterday') });
            return (
              <button
                key={x.id}
                className="b-row"
                onClick={() => {
                  onPick(x);
                  onClose();
                }}
              >
                <Avatar icon={cat?.icon ?? 'other'} color={cat?.color ?? '#64748b'} />
                <div className="b-row__main">
                  <div className="b-row__title">{x.note || categoryName(cat)}</div>
                  <div className="b-row__sub">
                    <span>{`${categoryName(cat)} · ${accountName(accounts.get(x.accountId))} · ${when}`}</span>
                  </div>
                </div>
                <div className="b-row__amount b-expense b-num">
                  <MoneyText currency={x.currency} text={money.plain(x.amount, x.currency)} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </IonModal>
  );
}
