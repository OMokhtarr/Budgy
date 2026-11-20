import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ar from './locales/ar.json';
import { followNativeLanguage, setNativeLanguage } from './nativeLocale';

const STORAGE_KEY = 'budgy-lang';

function readSaved(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved;
  } catch {
    /* ignore */
  }
  return navigator.language?.toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

const savedLang = readSaved();

function applyDir(lng: string) {
  const dir = lng === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.setAttribute('dir', dir);
  document.documentElement.setAttribute('lang', lng);
  document.querySelector('ion-app')?.setAttribute('dir', dir);
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar } },
  lng: savedLang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lng) => {
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    /* ignore */
  }
  applyDir(lng);
  void setNativeLanguage(lng === 'ar' ? 'ar' : 'en');
});

applyDir(savedLang);
followNativeLanguage(
  () => (i18n.language === 'ar' ? 'ar' : 'en'),
  (lng) => i18n.changeLanguage(lng),
);

export default i18n;
