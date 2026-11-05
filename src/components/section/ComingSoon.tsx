import { Link } from 'react-router';
import { Hammer } from 'lucide-react';
import { t } from '../../i18n';

export function ComingSoon() {
  return (
    <div className="mt-10 flex max-w-[60ch] items-start gap-4 rounded-[20px] border border-line bg-plinth p-6">
      <Hammer aria-hidden size={22} className="mt-1 shrink-0 text-ink-soft" />
      <div>
        <p className="m-0 font-display text-[20px] font-semibold">{t('section.soon')}</p>
        <p className="mb-0 mt-1 text-ink-soft">{t('section.soonText')}</p>
        <Link to="/#razdely" className="mt-3 inline-block font-medium text-ink underline underline-offset-4">
          {t('nav.sections')}
        </Link>
      </div>
    </div>
  );
}
