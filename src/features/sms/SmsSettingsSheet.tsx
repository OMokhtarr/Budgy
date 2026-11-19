import { IonChip, IonIcon, IonItem, IonLabel, IonList, IonModal, IonNote, IonToggle, useIonAlert } from '@ionic/react';
import { add, closeCircle, closeOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/core/contexts/SettingsContext';
import { useLearned } from './hooks';
import { addKeyword, removeKeyword } from './keywordList';
import { clearIgnoredPending } from './scan';
import type { SmsPermission } from './useSmsPermission';

/** Why texts can't be read: the permission was refused, or checking it failed. */
export function PermissionNotes({ perm }: { perm: SmsPermission }) {
  const { t } = useTranslation();
  return (
    <>
      {(perm.refused || perm.permission === 'denied') && <p className="b-muted b-hint">{t('sms.permissionDenied')}</p>}
      {perm.checkFailed && (
        <p className="b-hint" style={{ color: 'var(--ion-color-danger)' }}>
          {t('sms.permissionError')}
        </p>
      )}
    </>
  );
}

/** A list of keywords as chips: tap one to remove it, or "Add" to type a new one. */
function KeywordChips({ label, list, onChange, addTitle, placeholder }: {
  label: string;
  list: string[];
  onChange: (next: string[]) => void;
  addTitle: string;
  placeholder: string;
}) {
  const { t } = useTranslation();
  const [presentAlert] = useIonAlert();
  const ask = () =>
    presentAlert({
      header: addTitle,
      inputs: [{ name: 'keyword', type: 'text', placeholder }],
      buttons: [
        { text: t('common.cancel'), role: 'cancel' },
        { text: t('sms.addSender'), handler: (data: { keyword?: string }) => onChange(addKeyword(list, data.keyword ?? '')) },
      ],
    });
  return (
    <IonItem>
      <IonLabel>
        {label}
        <div style={{ marginTop: 6 }}>
          {list.map((s) => (
            <IonChip key={s} onClick={() => onChange(removeKeyword(list, s))}>
              <IonLabel>{s}</IonLabel>
              <IonIcon icon={closeCircle} />
            </IonChip>
          ))}
          <IonChip outline color="primary" onClick={ask}>
            <IonIcon icon={add} />
            <IonLabel>{t('sms.addSender')}</IonLabel>
          </IonChip>
        </div>
      </IonLabel>
    </IonItem>
  );
}

const hint = (text: string) => (
  <IonItem lines="none">
    <IonNote style={{ fontSize: 12.5, padding: '8px 0' }}>{text}</IonNote>
  </IonItem>
);

/** Bank texts → settings: reading on or off, auto scan, the permission, bank senders, ignore words and linked numbers. */
export default function SmsSettingsSheet({ isOpen, onClose, perm }: { isOpen: boolean; onClose: () => void; perm: SmsPermission }) {
  const { t } = useTranslation();
  const { smsImport } = useSettings();
  const linkCount = useLearned()?.links.length ?? 0;
  const { set } = perm;

  const setIgnoreWords = (ignoreWords: string[]) => {
    set({ ignoreWords });
    // Texts already waiting that contain a new word go now, not at the next scan.
    void clearIgnoredPending(ignoreWords);
  };

  return (
    <IonModal className="b-sheet-modal" isOpen={isOpen} breakpoints={[0, 1]} initialBreakpoint={1} handle={false} onDidDismiss={onClose}>
      <div className="b-sheet">
        <div className="b-sheet__head">
          <button className="b-iconbtn" onClick={onClose} aria-label={t('common.close')}>
            <IonIcon icon={closeOutline} />
          </button>
          <h2>{t('sms.settingsTitle')}</h2>
        </div>
        <div className="b-sheet__body">
          <IonList inset>
            <IonItem>
              <IonToggle
                key={perm.toggleKey}
                checked={smsImport.enabled}
                onIonChange={(e) => (e.detail.checked ? perm.turnOn() : set({ enabled: false }))}
              >
                {t('sms.readTexts')}
              </IonToggle>
            </IonItem>
            {smsImport.enabled && (
              <IonItem>
                <IonToggle checked={!!smsImport.autoScan} onIonChange={(e) => set({ autoScan: e.detail.checked })}>
                  {t('sms.autoScan')}
                </IonToggle>
              </IonItem>
            )}
            <IonItem>
              <IonLabel>{t('sms.permission')}</IonLabel>
              <IonNote slot="end">{t(perm.permission === 'granted' ? 'sms.permissionAllowed' : 'sms.permissionNotAllowed')}</IonNote>
            </IonItem>
            <KeywordChips
              label={t('sms.senders')}
              list={smsImport.senders}
              onChange={(senders) => set({ senders })}
              addTitle={t('sms.addSenderTitle')}
              placeholder={t('sms.addSenderPlaceholder')}
            />
            {hint(t('sms.sendersHint'))}
            <KeywordChips
              label={t('sms.ignoreWords')}
              list={smsImport.ignoreWords ?? []}
              onChange={setIgnoreWords}
              addTitle={t('sms.addIgnoreTitle')}
              placeholder={t('sms.addIgnorePlaceholder')}
            />
            {hint(t('sms.ignoreHint'))}
            <IonItem button routerLink="/sms/links" detail onClick={onClose}>
              <IonLabel>{t('sms.linkedNumbers')}</IonLabel>
              <IonNote slot="end">{linkCount}</IonNote>
            </IonItem>
          </IonList>
          <PermissionNotes perm={perm} />
        </div>
      </div>
    </IonModal>
  );
}
