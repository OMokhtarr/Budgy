import { useEffect, useState, type CSSProperties } from 'react';
import { IonIcon, IonModal, useIonActionSheet, useIonAlert } from '@ionic/react';
import { closeOutline, ellipsisVertical, trashOutline } from 'ionicons/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { useConverter, useMoney } from '@/core/contexts/SettingsContext';
import { useTxEditor } from '@/core/contexts/TxEditorContext';
import { categoryFits, useCategories, useLookups, useNames } from '@/core/db/hooks';
import { isMoneyBack } from '@/core/utils/flow';
import { pickableSubcategories } from '@/core/utils/subcategories';
import MoneyText from '@/shared/components/MoneyText';
import { iconFor } from '@/shared/icons';
import { deleteGroup, groupRows, setGroupCategory, setGroupNote, ungroup } from './bulk';
import { foldGroups, groupFlows } from './groups';

interface Props {
  /** The group to show; null keeps the sheet closed. */
  groupId: string | null;
  onClose(): void;
}

/** One group's rows: change its category or note for all of them, open a row, take one out, or delete them all. */
export default function GroupSheet({ groupId, onClose }: Props) {
  const { t } = useTranslation();
  const money = useMoney();
  const conv = useConverter();
  const openEditor = useTxEditor();
  const { accounts, categories } = useLookups();
  const activeCategories = useCategories();
  const { accountName, categoryName } = useNames();
  const [presentSheet] = useIonActionSheet();
  const [presentAlert] = useIonAlert();
  // Tagged with its group: right after the group changes, the hook still holds the last group's rows.
  const result = useLiveQuery(async () => ({ groupId, rows: groupId ? await groupRows(groupId) : [] }), [groupId]);
  const rows = result?.groupId === groupId ? result.rows : undefined;
  const [note, setNote] = useState('');

  const entry = rows && rows.length ? foldGroups(rows, conv)[0] : undefined;
  const group = entry?.kind === 'group' ? entry : undefined;
  const category = categories.get((group?.categoryId ?? rows?.[0]?.categoryId)!);
  const subcategoryId = rows?.find((x) => x.categoryId === category?.id)?.subcategoryId;
  const subcategories = pickableSubcategories(category, subcategoryId);
  const firstNote = rows?.[0]?.note ?? '';
  useEffect(() => setNote(firstNote), [groupId, firstNote]);

  // The note is saved when the field loses focus, and again on closing, which a swipe or back may do without blur.
  const saveNote = () => {
    if (groupId && note !== firstNote) void setGroupNote(groupId, note);
  };
  const close = () => {
    saveNote();
    onClose();
  };

  // A group down to one row (or none) isn't a group any more.
  useEffect(() => {
    if (groupId && rows && rows.length < 2) onClose();
  }, [groupId, rows, onClose]);

  const pickCategory = () => {
    if (!groupId || !rows) return;
    // Every row has to fit: money back only goes in categories that take spending.
    const flows = groupFlows(rows);
    const fits = (activeCategories ?? []).filter((c) => flows.every((f) => categoryFits(c, f)));
    presentSheet({
      header: t('transactions.changeCategory'),
      buttons: [
        ...fits.map((c) => ({ text: categoryName(c), handler: () => void setGroupCategory(groupId, c.id!) })),
        { text: t('common.cancel'), role: 'cancel' },
      ],
    });
  };

  const rowMenu = (id: string) => {
    const tx = rows?.find((x) => x.id === id);
    if (!tx) return;
    presentSheet({
      buttons: [
        { text: t('transactions.removeFromGroup'), handler: () => void ungroup(tx) },
        { text: t('common.cancel'), role: 'cancel' },
      ],
    });
  };

  const remove = () => {
    if (!groupId || !rows) return;
    presentAlert({
      header: t('transactions.deleteGroup', { count: rows.length }),
      message: t('editor.deleteMessage'),
      buttons: [
        { text: t('common.cancel'), role: 'cancel' },
        { text: t('common.delete'), role: 'destructive', handler: () => void deleteGroup(groupId).then(onClose) },
      ],
    });
  };

  const netCurrency = group?.currency ?? conv.base;
  const netValue = group?.netInCurrency ?? group?.net ?? 0;

  return (
    <IonModal className="b-sheet-modal" isOpen={groupId != null} breakpoints={[0, 1]} initialBreakpoint={1} handle={false} onDidDismiss={close}>
      <div className="b-sheet b-groupsheet">
        <div className="b-sheet__head">
          <button className="b-iconbtn" onClick={close} aria-label={t('common.close')}>
            <IonIcon icon={closeOutline} />
          </button>
          <h2>{t(group?.flow === 'income' ? 'transactions.groupReceived' : 'transactions.groupSpent')}</h2>
        </div>
        <div className="b-sheet__body">
          <div className="b-combine__net">
            <span>{t(group?.flow === 'income' ? 'sms.netReceived' : 'sms.netSpent')}</span>
            <strong className={`b-num ${group?.flow === 'income' ? 'b-income' : 'b-expense'}`}>
              {group?.flow === 'expense' && netValue < 0 && '+'}
              <MoneyText currency={netCurrency} text={money.plain(Math.abs(netValue), netCurrency)} />
            </strong>
          </div>
          <div className="b-combine">
            <button
              className={`b-smschip ${category ? 'is-set' : 'is-empty'}`}
              style={category ? ({ '--c': category.color } as CSSProperties) : undefined}
              onClick={pickCategory}
            >
              {category && <IonIcon icon={iconFor(category.icon)} />}
              {categoryName(category)}
            </button>
            {category && subcategories.length > 0 && (
              <div className="b-subchips" style={{ '--c': category.color } as CSSProperties}>
                {subcategories.map((s) => (
                  <button
                    key={s.id}
                    className={`b-subchip ${s.id === subcategoryId ? 'is-on' : ''}`}
                    onClick={() => groupId && void setGroupCategory(groupId, category.id!, s.id === subcategoryId ? undefined : s.id)}
                  >
                    <IonIcon icon={iconFor(s.icon)} />
                    {s.name}
                  </button>
                ))}
              </div>
            )}
            <input
              className="b-note"
              placeholder={t('editor.notePlaceholder')}
              value={note}
              maxLength={120}
              onChange={(e) => setNote(e.target.value)}
              onBlur={saveNote}
            />
          </div>
          {rows?.map((x) => {
            const acc = accounts.get(x.accountId);
            const plus = x.type === 'income';
            return (
              <div key={x.id} className="b-textssheet__part">
                <button className="b-groupsheet__row" onClick={() => openEditor({ tx: x })}>
                  <span className="b-textssheet__text">
                    <span className={`b-num ${plus ? 'b-income' : 'b-expense'}`} dir="ltr">
                      {plus ? '+' : '−'}
                      <MoneyText currency={x.currency} text={money.plain(x.amount, x.currency)} />
                    </span>
                    <small className="b-muted">
                      {accountName(acc)}
                      {isMoneyBack(x) ? ` · ${t('transactions.moneyBack')}` : ''}
                    </small>
                  </span>
                </button>
                <button className="b-iconbtn" onClick={() => rowMenu(x.id!)} aria-label={t('transactions.more')}>
                  <IonIcon icon={ellipsisVertical} />
                </button>
              </div>
            );
          })}
        </div>
        <div className="b-sheet__foot b-sheet__foot--one">
          <button className="b-btn b-btn--muted" onClick={remove}>
            <IonIcon icon={trashOutline} />
            {t('transactions.deleteGroupButton')}
          </button>
        </div>
      </div>
    </IonModal>
  );
}
