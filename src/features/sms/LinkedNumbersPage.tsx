import { useEffect, useMemo, useState } from 'react';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonPage, IonTitle, IonToolbar, useIonRouter } from '@ionic/react';
import { linkOutline, trashOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { alive, db, softDelete } from '@/core/db/db';
import { useAccounts, useNames } from '@/core/db/hooks';
import { stampAfter } from '@/core/utils/stamp';
import type { SmsLink } from '@/shared/models';
import { useLearned } from './hooks';
import { linkCardLabel } from './linkLabel';
import PickerSheet, { type PickerItem } from './PickerSheet';
import { useSmsAvailability } from './useSmsAvailable';

const PATH = '/sms/links';

/** Settings → Linked numbers: the card numbers Budgy learned, each pointing at an account; fix or remove them. */
export default function LinkedNumbersPage() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const router = useIonRouter();
  const available = useSmsAvailability();
  const { accountName } = useNames();
  const learned = useLearned();
  const accounts = useAccounts(true);
  // Kept after the picker closes, so the sheet doesn't empty while it slides away.
  const [editing, setEditing] = useState<SmsLink | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const links = useMemo(
    () => [...(learned?.links ?? [])].sort((a, b) => a.address.localeCompare(b.address) || (a.digits ?? '').localeCompare(b.digits ?? '')),
    [learned],
  );
  const pickerItems = useMemo(
    (): PickerItem[] => (accounts ?? []).filter((a) => !a.archived).map((a) => ({ id: a.id!, name: accountName(a), icon: a.icon, color: a.color })),
    [accounts, accountName],
  );

  // Waits for the availability check; hidden pages stay mounted in Ionic's stack, so only leaves while showing.
  useEffect(() => {
    if (available === false && pathname === PATH) router.push('/categories', 'root', 'replace');
  }, [available, pathname, router]);

  const pick = async (accountId: string) => {
    if (!editing) return;
    // Re-read, so a sync that changed or removed the link meanwhile isn't overwritten.
    const current = await db.smsLinks.get(editing.id!);
    if (!current || !alive(current)) return;
    // Later than the stored stamp, so an edit on a phone whose clock is behind isn't reverted by sync.
    await db.smsLinks.put({ ...current, accountId, updatedAt: stampAfter(current.updatedAt) });
  };

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar className="b-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/settings" text="" />
          </IonButtons>
          <IonTitle className="b-title">{t('sms.linkedNumbers')}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {available === true && learned && accounts && (
          <div className="b-page">
            {links.length === 0 ? (
              <div className="b-empty b-smsempty">
                <IonIcon icon={linkOutline} />
                <p>{t('sms.noLinks')}</p>
              </div>
            ) : (
              <IonList inset>
                {links.map((link) => {
                  const { sender, digits } = linkCardLabel(link);
                  const account = accounts.find((a) => a.id === link.accountId);
                  const usable = !!account && !account.archived;
                  return (
                    <IonItem
                      key={link.id}
                      button
                      detail={false}
                      onClick={() => {
                        setEditing(link);
                        setPickerOpen(true);
                      }}
                    >
                      <IonLabel>
                        <h3 dir="auto">{digits ? `${sender} ${digits}` : t('sms.noNumber', { sender })}</h3>
                        <p>{usable ? accountName(account) : t('sms.accountRemoved')}</p>
                      </IonLabel>
                      <IonButton
                        slot="end"
                        fill="clear"
                        color="danger"
                        aria-label={t('common.delete')}
                        onClick={(e) => {
                          e.stopPropagation();
                          void softDelete(db.smsLinks, [link.id!]);
                        }}
                      >
                        <IonIcon slot="icon-only" icon={trashOutline} />
                      </IonButton>
                    </IonItem>
                  );
                })}
              </IonList>
            )}
          </div>
        )}
      </IonContent>
      <PickerSheet
        isOpen={pickerOpen}
        title={t('sms.pickAccount')}
        items={pickerItems}
        selectedId={editing?.accountId}
        onPick={(id) => void pick(id)}
        onClose={() => setPickerOpen(false)}
      />
    </IonPage>
  );
}
