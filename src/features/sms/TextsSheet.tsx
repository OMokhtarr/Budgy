import type { CSSProperties, ReactNode } from 'react';
import { IonIcon, IonModal } from '@ionic/react';
import { closeOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { useMoney } from '@/core/contexts/SettingsContext';
import { useAccounts, useNames } from '@/core/db/hooks';
import { iconFor } from '@/shared/icons';
import type { SmsPending } from '@/shared/models';

export interface SheetPart {
  item: SmsPending;
  accountId?: string;
}

interface Props {
  isOpen: boolean;
  title: string;
  parts: SheetPart[];
  onPickAccount(fingerprint: string): void;
  /** Shown under the texts, e.g. the category and note of a combined entry. */
  children?: ReactNode;
  footer: ReactNode;
  onClose(): void;
}

/** Several bank texts, each with the account it goes on, ready to be saved together. */
export default function TextsSheet({ isOpen, title, parts, onPickAccount, children, footer, onClose }: Props) {
  const { t } = useTranslation();
  const money = useMoney();
  const accounts = useAccounts(true);
  const { accountName } = useNames();

  return (
    <IonModal className="b-sheet-modal" isOpen={isOpen} breakpoints={[0, 1]} initialBreakpoint={1} handle={false} onDidDismiss={onClose}>
      <div className="b-sheet b-textssheet">
        <div className="b-sheet__head">
          <button className="b-iconbtn" onClick={onClose} aria-label={t('common.close')}>
            <IonIcon icon={closeOutline} />
          </button>
          <h2>{title}</h2>
        </div>
        <div className="b-sheet__body">
          {parts.map(({ item, accountId }) => {
            const account = accounts?.find((a) => a.id === accountId);
            const incoming = item.direction === 'in';
            return (
              <div key={item.fingerprint} className="b-textssheet__part">
                <div className="b-textssheet__text">
                  <span className={`b-num ${incoming ? 'b-income' : 'b-expense'}`} dir="ltr">
                    {incoming ? '+' : '−'} {money.plain(item.amount ?? 0, item.currency)} {item.currency}
                  </span>
                  <small className="b-muted">{item.merchant ?? item.address}</small>
                </div>
                <button
                  className={`b-smschip ${account ? 'is-set' : 'is-empty'}`}
                  style={account ? ({ '--c': account.color } as CSSProperties) : undefined}
                  onClick={() => onPickAccount(item.fingerprint)}
                >
                  {account && <IonIcon icon={iconFor(account.icon)} />}
                  {account ? accountName(account) : t('sms.pickAccount')}
                </button>
              </div>
            );
          })}
          {children}
        </div>
        <div className="b-sheet__foot b-sheet__foot--one">{footer}</div>
      </div>
    </IonModal>
  );
}
