import { useState, type CSSProperties } from 'react';
import { IonIcon, IonModal } from '@ionic/react';
import { closeOutline, funnelOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { selectedByDefault, useAccountFilter } from '@/core/contexts/AccountFilterContext';
import { useMoney } from '@/core/contexts/SettingsContext';
import { useAccounts, useBalances, useNames } from '@/core/db/hooks';
import { groupOf } from '@/core/utils/currency';
import { iconFor } from '@/shared/icons';
import MoneyText from '@/shared/components/MoneyText';
import type { AccountGroup } from '@/shared/models';

const GROUPS: AccountGroup[] = ['regular', 'savings', 'debt'];

/** Bottom sheet for choosing which accounts the app shows (balance, categories, transactions, overview). */
export default function AccountsFilterSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const money = useMoney();
  const { accountName } = useNames();
  const accounts = useAccounts();
  const balances = useBalances();
  const { selected, setSelected } = useAccountFilter();
  // Changes are only applied on Done; the draft starts from the current selection each time the sheet opens.
  const [draft, setDraft] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setDraft((d) => {
      const next = new Set(d);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const reset = () => setDraft(new Set((accounts ?? []).filter(selectedByDefault).map((a) => a.id!)));
  const done = () => {
    setSelected(draft);
    onClose();
  };

  return (
    <IonModal
      className="b-sheet-modal"
      isOpen={isOpen}
      breakpoints={[0, 1]}
      initialBreakpoint={1}
      handle={false}
      onWillPresent={() => setDraft(new Set(selected))}
      onDidDismiss={onClose}
    >
      <div className="b-sheet">
        <div className="b-sheet__head">
          <button className="b-iconbtn" onClick={onClose} aria-label={t('common.close')}>
            <IonIcon icon={closeOutline} />
          </button>
          <h2>{t('filter.title')}</h2>
        </div>

        <div className="b-sheet__body">
          {GROUPS.map((g) => {
            const list = (accounts ?? []).filter((a) => groupOf(a) === g);
            if (!list.length) return null;
            return (
              <div key={g}>
                <div className="b-section-title">{t(`filter.group.${g}`)}</div>
                <div className="b-chipgrid">
                  {list.map((a) => (
                    <button
                      key={a.id}
                      className={`b-acchip ${draft.has(a.id!) ? 'is-on' : ''}`}
                      style={{ '--c': a.color } as CSSProperties}
                      onClick={() => toggle(a.id!)}
                      aria-pressed={draft.has(a.id!)}
                    >
                      <IonIcon icon={iconFor(a.icon)} />
                      <span className="b-acchip__text">
                        <strong>{accountName(a)}</strong>
                        <MoneyText currency={a.currency} text={money.plain(balances?.get(a.id!)?.[a.currency] ?? 0, a.currency)} />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="b-sheet__foot">
          <button className="b-btn b-btn--muted" onClick={reset}>
            {t('filter.reset')}
          </button>
          <button className="b-btn b-btn--primary" onClick={done} disabled={draft.size === 0}>
            <IonIcon icon={funnelOutline} />
            {t('filter.done')}
          </button>
        </div>
      </div>
    </IonModal>
  );
}
