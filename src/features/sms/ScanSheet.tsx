import { useState } from 'react';
import { IonIcon, IonModal, IonSpinner, useIonAlert, useIonRouter, useIonToast } from '@ionic/react';
import { closeOutline, searchOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { useLocale, useSettings } from '@/core/contexts/SettingsContext';
import { dayTimeLabel } from '@/core/utils/period';
import { SmsInbox } from './native';
import type { ScanPeriod } from './scan';
import { useInboxScan } from './useInboxScan';

const PERIODS: ScanPeriod[] = ['sinceLast', '3d', '1w', '2w', '1m', '3m', '6m'];

/** "Scan bank texts from…": pick a period, then read the inbox into the review list. */
export default function ScanSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const router = useIonRouter();
  const { smsImport } = useSettings();
  const runScan = useInboxScan();
  const [presentToast] = useIonToast();
  const [presentAlert] = useIonAlert();
  const [period, setPeriod] = useState<ScanPeriod>('1w');
  const [scanning, setScanning] = useState(false);

  const last = smsImport.lastScanAt;
  const periods = last ? PERIODS : PERIODS.filter((p) => p !== 'sinceLast');
  const toast = (message: string) => presentToast({ message, duration: 1800, position: 'top', color: 'medium' });

  const scan = async () => {
    if (scanning) return;
    setScanning(true);
    try {
      const { sms } = await SmsInbox.checkPermissions();
      if (sms !== 'granted') {
        onClose();
        void presentAlert({
          message: t('sms.scanNoPermission'),
          buttons: [
            { text: t('common.close'), role: 'cancel' },
            { text: t('menu.settings'), handler: () => router.push('/settings', 'forward') },
          ],
        });
        return;
      }
      const added = await runScan(period);
      onClose();
      void toast(added ? t('sms.scanFound', { count: added }) : t('sms.scanNothing'));
    } catch {
      void toast(t('sms.scanFailed'));
    } finally {
      setScanning(false);
    }
  };

  return (
    <IonModal
      className="b-sheet-modal"
      isOpen={isOpen}
      breakpoints={[0, 1]}
      initialBreakpoint={1}
      handle={false}
      onWillPresent={() => setPeriod(last ? 'sinceLast' : '1w')}
      onDidDismiss={onClose}
    >
      <div className="b-sheet">
        <div className="b-sheet__head">
          <button className="b-iconbtn" onClick={onClose} aria-label={t('common.close')}>
            <IonIcon icon={closeOutline} />
          </button>
          <h2>{t('sms.scanFrom')}</h2>
        </div>
        <div className="b-sheet__body" role="radiogroup" aria-label={t('sms.scanFrom')}>
          {periods.map((p) => (
            <button
              key={p}
              role="radio"
              aria-checked={p === period}
              className={`b-scanopt ${p === period ? 'is-on' : ''}`}
              disabled={scanning}
              onClick={() => setPeriod(p)}
            >
              {t(`sms.period.${p}`)}
              {p === 'sinceLast' && last && (
                <span className="b-muted"> ({dayTimeLabel(new Date(last), locale, { today: t('period.today'), yesterday: t('period.yesterday') })})</span>
              )}
            </button>
          ))}
          <p className="b-muted b-hint">{t('sms.scanHint')}</p>
        </div>
        <div className="b-sheet__foot b-sheet__foot--one">
          <button className="b-btn b-btn--primary" onClick={() => void scan()} disabled={scanning}>
            {scanning ? <IonSpinner name="crescent" /> : <IonIcon icon={searchOutline} />}
            {t('sms.scan')}
          </button>
        </div>
      </div>
    </IonModal>
  );
}
