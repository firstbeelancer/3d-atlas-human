import { Link } from 'react-router';
import { t } from '../i18n';
import { useDocumentMeta } from '../lib/meta';

export function NotFoundPage() {
  useDocumentMeta(t('notFound.title'), t('notFound.text'));
  return (
    <div className="mx-auto max-w-[1240px] px-4 py-20 sm:px-6">
      <h1 className="m-0 text-[clamp(40px,6vw,72px)] font-bold leading-none tracking-[-0.04em]">{t('notFound.title')}</h1>
      <p className="mt-4 max-w-[52ch] text-ink-soft">{t('notFound.text')}</p>
      <Link to="/" className="mt-2 inline-block font-medium underline underline-offset-4">
        {t('nav.home')}
      </Link>
    </div>
  );
}
