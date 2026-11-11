import { IonApp, IonIcon, IonLabel, IonRouterOutlet, IonTabBar, IonTabButton, IonTabs, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Redirect, Route } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TxEditorProvider } from '@/core/contexts/TxEditorContext';
import { CloudProvider } from '@/core/cloud/CloudContext';
import { accountsIcon, categoriesIcon, overviewIcon, transactionsIcon } from '@/shared/icons';

import AccountsPage from '@/features/accounts/AccountsPage';
import CategoriesPage from '@/features/categories/CategoriesPage';
import TransactionsPage from '@/features/transactions/TransactionsPage';
import OverviewPage from '@/features/overview/OverviewPage';
import SettingsPage from '@/features/settings/SettingsPage';
import ProfilePage from '@/features/profile/ProfilePage';
import DataPage from '@/features/data/DataPage';
import LinkedNumbersPage from '@/features/sms/LinkedNumbersPage';
import SmsReviewPage from '@/features/sms/SmsReviewPage';
import AppMenu, { MENU_CONTENT_ID } from '@/features/menu/AppMenu';
import FirstRunCurrency from '@/features/onboarding/FirstRunCurrency';
import BackupReminder from '@/features/data/BackupReminder';
import AutoScan from '@/features/sms/AutoScan';

setupIonicReact({ mode: 'ios' });

export default function App() {
  const { t } = useTranslation();

  return (
    <IonApp>
      <CloudProvider>
      <TxEditorProvider>
      <IonReactRouter>
        <AppMenu />
        <div id={MENU_CONTENT_ID} className="ion-page">
        <IonTabs>
          <IonRouterOutlet>
            <Route exact path="/accounts" component={AccountsPage} />
            <Route exact path="/categories" component={CategoriesPage} />
            <Route exact path="/transactions" component={TransactionsPage} />
            <Route exact path="/overview" component={OverviewPage} />
            {/* Opened from the side menu */}
            <Route exact path="/settings" component={SettingsPage} />
            <Route exact path="/profile" component={ProfilePage} />
            <Route exact path="/data" component={DataPage} />
            <Route exact path="/sms" component={SmsReviewPage} />
            <Route exact path="/sms/links" component={LinkedNumbersPage} />
            <Route exact path="/">
              <Redirect to="/categories" />
            </Route>
          </IonRouterOutlet>

          <IonTabBar slot="bottom">
            <IonTabButton tab="accounts" href="/accounts">
              <IonIcon icon={accountsIcon} />
              <IonLabel>{t('tabs.accounts')}</IonLabel>
            </IonTabButton>
            <IonTabButton tab="categories" href="/categories">
              <IonIcon icon={categoriesIcon} />
              <IonLabel>{t('tabs.categories')}</IonLabel>
            </IonTabButton>
            <IonTabButton tab="transactions" href="/transactions">
              <IonIcon icon={transactionsIcon} />
              <IonLabel>{t('tabs.transactions')}</IonLabel>
            </IonTabButton>
            <IonTabButton tab="overview" href="/overview">
              <IonIcon icon={overviewIcon} />
              <IonLabel>{t('tabs.overview')}</IonLabel>
            </IonTabButton>
          </IonTabBar>
        </IonTabs>
        </div>
      </IonReactRouter>
      </TxEditorProvider>
      <FirstRunCurrency />
      <BackupReminder />
      <AutoScan />
      </CloudProvider>
    </IonApp>
  );
}
