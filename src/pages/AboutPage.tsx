import { t } from '../i18n';
import { useDocumentMeta } from '../lib/meta';

export function AboutPage() {
  useDocumentMeta(t('nav.about'));
  return (
    <div className="mx-auto max-w-[1240px] px-4 py-12 sm:px-6">
      <h1 className="m-0 text-[clamp(40px,6vw,72px)] font-bold leading-none tracking-[-0.04em]">{t('nav.about')}</h1>
      <section id="svyaz" className="mt-10" />
    </div>
  );
}
