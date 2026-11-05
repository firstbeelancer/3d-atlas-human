import { lazy, Suspense } from 'react';
import { Link } from 'react-router';
import { SECTIONS } from '../content/sections';
import { systemColor, SYSTEMS } from '../content/systems';
import { t } from '../i18n';
import { useDocumentMeta } from '../lib/meta';
import { OrganIcon } from '../components/icons/organs';
import { SearchBox } from '../components/SearchBox';
import { Stage } from '../three/Stage';
import { SelectionProvider, useSelection } from '../three/selection';
import { getSection } from '../content/sections';

const BodyFigure = lazy(() => import('../models/body/BodyFigure'));

/** Подпись к выбранному органу на витрине — как табличка у экспоната. */
function ExhibitCaption() {
  const { selected } = useSelection();
  const s = selected ? getSection(selected) : undefined;
  return (
    <div aria-live="polite" className="mt-4 min-h-[92px] rounded-[20px] border border-line bg-plinth px-5 py-4">
      {s ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="m-0 font-display text-[22px] font-bold tracking-[-0.02em]">{s.title}</p>
            <p className="m-0 mt-0.5 text-[15px] text-ink-soft">{s.tagline}</p>
          </div>
          <Link
            to={`/razdel/${s.slug}`}
            className="shrink-0 rounded-full bg-ink px-5 py-2.5 font-medium text-stone no-underline hover:opacity-90"
          >
            {t('home.open')}
          </Link>
        </div>
      ) : (
        <p className="m-0 text-ink-soft">{t('home.captionHint')}</p>
      )}
    </div>
  );
}

const STEPS = [
  { title: () => t('home.step1Title'), text: () => t('home.step1Text') },
  { title: () => t('home.step2Title'), text: () => t('home.step2Text') },
  { title: () => t('home.step3Title'), text: () => t('home.step3Text') },
];

export function HomePage() {
  useDocumentMeta(null, t('site.description'));
  return (
    <div className="mx-auto max-w-[1320px] px-4 sm:px-6">
      <SelectionProvider>
        <section className="grid items-center gap-8 pb-6 pt-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14 lg:pt-12">
          <div className="lg:pb-24">
            <h1 className="m-0 text-[clamp(46px,7vw,96px)] font-extrabold leading-[0.93] tracking-[-0.05em]">
              {t('home.title')}
            </h1>
            <p className="m-0 mt-6 max-w-[42ch] text-[19px] leading-[1.55] text-ink-soft">
              {t('home.lead')}
            </p>
            <div className="mt-8">
              <SearchBox />
            </div>
          </div>
          <div>
            <Stage
              label={t('home.figureLabel')}
              description={t('home.figureDescription')}
              camera={{ position: [0, 0.1, 18.5], fov: 32 }}
              target={[0, -1.05, 0]}
              floorY={-4.72}
              className="aspect-[4/5] w-full max-h-[80vh] sm:aspect-square lg:aspect-[5/6]"
            >
              {(state) => (
                <Suspense fallback={null}>
                  <BodyFigure state={state} />
                </Suspense>
              )}
            </Stage>
            <ExhibitCaption />
          </div>
        </section>
      </SelectionProvider>

      <section id="razdely" aria-label={t('home.indexLabel')} className="mt-16 scroll-mt-24">
        <h2 className="m-0 text-[clamp(32px,4vw,48px)] font-extrabold tracking-[-0.04em]">{t('nav.sections')}</h2>
        <div className="mt-8 grid gap-x-10 gap-y-10 md:grid-cols-2 xl:grid-cols-3">
          {SYSTEMS.map((sys) => (
            <div key={sys.id} style={{ ['--accent' as string]: systemColor(sys.id) }}>
              <h3 className="m-0 border-b-2 border-ink pb-2 font-display text-[19px] font-bold tracking-[-0.015em]">{sys.title}</h3>
              <ul className="m-0 list-none p-0">
                {SECTIONS.filter((s) => s.system === sys.id).map((s) => (
                  <li key={s.slug} className="border-b border-line">
                    <Link
                      to={`/razdel/${s.slug}`}
                      className="group flex items-center gap-3.5 py-3 text-ink no-underline"
                    >
                      <span
                        className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-plinth transition-colors group-hover:text-[var(--accent)]"
                        style={s.ready ? { color: 'var(--accent)' } : undefined}
                      >
                        <OrganIcon name={s.icon} size={26} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-display text-[18px] font-semibold leading-tight tracking-[-0.01em] group-hover:underline group-hover:underline-offset-4">
                          {s.title}
                        </span>
                        <span className="mt-0.5 block truncate text-[14px] text-ink-soft">{s.tagline}</span>
                      </span>
                      {!s.ready && (
                        <span className="shrink-0 rounded-full border border-line px-2.5 py-0.5 text-[13px] text-ink-soft">
                          {t('home.soon')}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-20">
        <h2 className="m-0 text-[clamp(28px,3.4vw,40px)] font-extrabold tracking-[-0.035em]">{t('home.howTitle')}</h2>
        <ol className="m-0 mt-6 grid list-none gap-6 p-0 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title()} className="border-t-2 border-ink pt-4">
              <span className="font-display text-[44px] font-extrabold leading-none tracking-[-0.04em] text-line">{i + 1}</span>
              <p className="m-0 mt-2 font-display text-[21px] font-bold tracking-[-0.015em]">{step.title()}</p>
              <p className="m-0 mt-1.5 max-w-[34ch] text-ink-soft">{step.text()}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
