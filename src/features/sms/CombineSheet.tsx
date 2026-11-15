import type { CSSProperties } from 'react';
import { IonIcon } from '@ionic/react';
import { useTranslation } from 'react-i18next';
import { useConverter, useMoney } from '@/core/contexts/SettingsContext';
import { useNames } from '@/core/db/hooks';
import { iconFor } from '@/shared/icons';
import type { Category } from '@/shared/models';
import TextsSheet, { type SheetPart } from './TextsSheet';

interface Props {
  isOpen: boolean;
  parts: SheetPart[];
  category?: Category;
  /** Money in counts as money back on the (expense) category. */
  moneyBack: boolean;
  note: string;
  busy: boolean;
  onPickAccount(fingerprint: string): void;
  onPickCategory(): void;
  onNote(note: string): void;
  onSave(): void;
  onClose(): void;
}

/** "Combine into one": the texts with their accounts, the net, and one category and note for the entry. */
export default function CombineSheet({ isOpen, parts, category, moneyBack, note, busy, onPickAccount, onPickCategory, onNote, onSave, onClose }: Props) {
  const { t } = useTranslation();
  const money = useMoney();
  const conv = useConverter();
  const { categoryName } = useNames();

  // Spending less money back, or (all money in) what came in; in the texts' currency when they share one.
  const spending = moneyBack || parts.some((p) => p.item.direction !== 'in');
  const signOf = (p: SheetPart) => (p.item.direction === 'in' ? -1 : 1) * (spending ? 1 : -1);
  const currencies = new Set(parts.map((p) => p.item.currency));
  const shared = currencies.size === 1 ? parts[0]?.item.currency : undefined;
  const net = parts.reduce((s, p) => s + signOf(p) * (shared ? p.item.amount ?? 0 : conv.toBase(p.item.amount ?? 0, p.item.currency ?? conv.base)), 0);
  const netCurrency = shared ?? conv.base;
  const ready = !busy && !!category && parts.every((p) => p.accountId);

  return (
    <TextsSheet
      isOpen={isOpen}
      title={t('sms.combineTitle', { count: parts.length })}
      parts={parts}
      onPickAccount={onPickAccount}
      footer={
        <button className="b-btn b-btn--primary" onClick={onSave} disabled={!ready}>
          {t('common.save')}
        </button>
      }
      onClose={onClose}
    >
      <div className="b-combine">
        <div className="b-combine__net">
          <span>{t(spending ? 'sms.netSpent' : 'sms.netReceived')}</span>
          <strong className={`b-num ${spending ? 'b-expense' : 'b-income'}`} dir="ltr">
            {money.plain(Math.abs(net), netCurrency)} {netCurrency}
          </strong>
        </div>
        <button
          className={`b-smschip ${category ? 'is-set' : 'is-empty'}`}
          style={category ? ({ '--c': category.color } as CSSProperties) : undefined}
          onClick={onPickCategory}
        >
          {category && <IonIcon icon={iconFor(category.icon)} />}
          {category ? categoryName(category) : t('sms.pickCategory')}
        </button>
        {category && moneyBack && !parts.some((p) => p.item.direction !== 'in') && (
          <p className="b-smscard__note">{t('sms.moneyBackNote', { category: categoryName(category) })}</p>
        )}
        <input className="b-note" placeholder={t('editor.notePlaceholder')} value={note} maxLength={120} onChange={(e) => onNote(e.target.value)} />
      </div>
    </TextsSheet>
  );
}
