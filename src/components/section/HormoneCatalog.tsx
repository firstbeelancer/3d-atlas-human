import { Link } from 'react-router';
import { ArrowUpRight } from 'lucide-react';
import { HORMONE_CATEGORIES, HORMONES } from '../../content/hormones';
import { t } from '../../i18n';

/** Каталог отдельных страниц гормонов на странице раздела «Гормоны» (/razdel/gormony). */
export function HormoneCatalog() {
  return (
    <section className="mt-14" aria-labelledby="hormone-catalog-title">
      <h2
        id="hormone-catalog-title"
        className="m-0 text-[clamp(26px,3vw,32px)] font-bold leading-tight tracking-[-0.03em]"
      >
        {t('hormones.catalogTitle')}
      </h2>
      <p className="m-0 mt-3 max-w-[60ch] text-ink-soft">{t('hormones.catalogLead')}</p>

      <div className="mt-6 flex flex-col gap-8">
        {HORMONE_CATEGORIES.map((cat) => {
          const items = HORMONES.filter((h) => h.category === cat.id);
          return (
            <div key={cat.id}>
              <h3 className="m-0 font-display text-[18px] font-bold tracking-[-0.01em]" style={{ color: 'var(--accent)' }}>
                {cat.title}
              </h3>
              <p className="m-0 mt-1 text-[15px] text-ink-soft">{cat.subtitle}</p>
              <ul className="m-0 mt-3 grid list-none gap-3 p-0 sm:grid-cols-2">
                {items.map((h) => (
                  <li key={h.slug}>
                    <Link
                      to={`/razdel/gormony/${h.slug}`}
                      className="group flex h-full flex-col justify-between gap-2 rounded-[18px] border border-line bg-plinth p-4 text-ink no-underline transition-colors hover:border-ink"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <span className="flex items-center gap-2 font-display text-[18px] font-semibold tracking-[-0.01em]">
                            <span
                              aria-hidden
                              className="inline-block size-2.5 shrink-0 rounded-full"
                              style={{ background: h.accent }}
                            />
                            {h.title}
                          </span>
                          <span className="shrink-0 rounded-full border border-line bg-wash px-2 py-0.5 font-mono text-[12px] text-ink-soft">
                            {h.formula}
                          </span>
                        </div>
                        <p className="m-0 mt-1.5 text-[14.5px] leading-snug text-ink-soft">{h.tagline}</p>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-1 text-[13px] text-ink-soft">
                        <span className="truncate">{h.sourceShort}</span>
                        <ArrowUpRight
                          size={15}
                          aria-hidden
                          className="shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                        />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
