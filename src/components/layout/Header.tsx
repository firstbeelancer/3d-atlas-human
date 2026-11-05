import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { Menu, X } from 'lucide-react';
import { t } from '../../i18n';
import { LogoMark } from './Logo';
import { ThemeToggle } from './ThemeToggle';

const NAV = [
  { to: '/#razdely', label: () => t('nav.sections') },
  { to: '/razdel/kletki-i-belki', label: () => t('nav.cells') },
  { to: '/o-proekte', label: () => t('nav.about') },
];

/** `tools` — место для поиска и переключателя 18+ (добавляются в следующих задачах). */
export function Header({ tools }: { tools?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname, location.hash]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-stone/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-3 px-4 sm:px-6">
        <Link to="/" className="mr-auto flex items-center gap-2.5 text-ink no-underline" aria-label={t('nav.home')}>
          <LogoMark />
          <span className="whitespace-nowrap font-display text-[17px] font-bold tracking-[-0.02em] sm:text-[19px]">{t('site.name')}</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label={t('nav.sections')}>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className="rounded-full px-3.5 py-2 text-[15px] text-ink-soft no-underline transition-colors hover:bg-wash hover:text-ink"
            >
              {item.label()}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          {tools}
          <ThemeToggle />
          <button
            type="button"
            className="grid size-10 place-items-center rounded-full text-ink hover:bg-wash md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? t('nav.close') : t('nav.menu')}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-nav" className="border-t border-line px-4 pb-4 pt-2 md:hidden" aria-label={t('nav.menu')}>
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="block border-b border-line py-3.5 font-display text-[20px] font-semibold text-ink no-underline last:border-0"
            >
              {item.label()}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
