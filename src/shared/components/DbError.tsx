import { useTranslation } from 'react-i18next';

/** Shown instead of the app when the on-device database can't be opened. */
export default function DbError() {
  const { t } = useTranslation();
  return (
    <div className="b-dberror">
      <img src="/icon.png" alt="" />
      <h1>{t('dbError.title')}</h1>
      <p>{t('dbError.message')}</p>
      <button className="b-btn b-btn--primary" onClick={() => window.location.reload()}>
        {t('dbError.retry')}
      </button>
    </div>
  );
}
