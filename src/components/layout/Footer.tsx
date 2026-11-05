import { Link } from 'react-router';
import { Info } from 'lucide-react';
import { t } from '../../i18n';

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-3 px-4 py-8 text-[15px] text-ink-soft sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="m-0 flex items-start gap-2.5">
          <Info aria-hidden size={18} className="mt-[3px] shrink-0" />
          <span>
            {t('footer.disclaimer')}{' '}
            <Link to="/o-proekte#svyaz" className="font-medium text-ink underline underline-offset-4 hover:no-underline">
              {t('footer.contact')}
            </Link>
          </span>
        </p>
        <p className="m-0">{t('footer.license')}</p>
      </div>
    </footer>
  );
}
