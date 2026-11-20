// The side menu's "Rate us" and "Support" items.
// TODO before publishing: confirm the store listing URL.
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.budgymoney.app';
export const SUPPORT_EMAIL = 'or.mokhtar@gmail.com';

/** The published privacy policy (the `gh-pages` branch), in English and Arabic. */
export const privacyPolicyUrl = (language: string) =>
  `https://omokhtarr.github.io/Budgy/${language === 'ar' ? 'privacy-ar' : 'privacy'}.html`;
