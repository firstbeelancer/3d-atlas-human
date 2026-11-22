import { lazy, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, ChevronRight, Scale, ShieldAlert } from 'lucide-react';
import { getHormone } from '../content/hormones';
import { loadHormoneContent } from '../content/hormones/loadHormone';
import type { HormoneDetailContent } from '../content/hormones/types';
import { getSection } from '../content/sections';
import { systemColor } from '../content/systems';
import { t } from '../i18n';
import { useDocumentMeta } from '../lib/meta';
import { Stage, type StageLegendItem, type StageMode } from '../three/Stage';
import { SelectionProvider } from '../three/selection';
import {
  Block,
  FactList,
  KidSay,
  Paragraphs,
  PartsList,
  RelatedSections,
  StatCards,
} from '../components/section/blocks';
import { NotFoundPage } from './NotFoundPage';

const HormoneModel = lazy(() => import('../models/hormone/HormoneModel'));

const HORMONE_MODES: StageMode[] = [
  { id: 'pathway', icon: 'activity', group: 'view', clearsSelection: true },
  { id: 'surface', icon: 'inside', group: 'view' },
];

const ATOMIC_LEGEND: readonly StageLegendItem[] = [
  { label: 'hormone.legend.carbon', color: '#444c5e' },
  { label: 'hormone.legend.nitrogen', color: '#3474e6' },
  { label: 'hormone.legend.oxygen', color: '#e03e3e' },
  { label: 'hormone.legend.iodine', color: '#8f3ad4' },
];

const PEPTIDE_LEGEND: readonly StageLegendItem[] = [
  { label: 'hormone.legend.activeSite', color: '#f5b832' },
  { label: 'hormone.legend.brake', color: '#2dc4b6' },
];

export function HormonePage() {
  const { hormone: slug = '' } = useParams();
  const meta = getHormone(slug);
  const parent = getSection('gormony');
  const [content, setContent] = useState<HormoneDetailContent | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useDocumentMeta(meta ? `${meta.title} — ${parent?.title ?? ''}` : null, meta?.tagline);

  useEffect(() => {
    let alive = true;
    setContent(null);
    setLoadError(false);
    if (meta) {
      loadHormoneContent(meta.slug)
        .then((c) => alive && setContent(c))
        .catch(() => alive && setLoadError(true));
    }
    return () => {
      alive = false;
    };
  }, [meta, attempt]);

  const names = useMemo(
    () => (content ? Object.fromEntries(content.parts.map((p) => [p.id, p.name])) : undefined),
    [content],
  );

  if (!meta) return <NotFoundPage />;

  const legend =
    meta.chemClass === 'iodothyronine'
      ? ATOMIC_LEGEND
      : meta.chemClass === 'peptide'
        ? PEPTIDE_LEGEND
        : ATOMIC_LEGEND.slice(0, 3);

  const siblingHormones = meta.relatedHormones
    .map(getHormone)
    .filter((h): h is NonNullable<typeof h> => !!h);

  return (
    <SelectionProvider key={`hormone-${meta.slug}`}>
      <article
        className="mx-auto max-w-[1320px] px-4 pb-10 pt-5 sm:px-6 lg:pt-7"
        style={{ ['--accent' as string]: systemColor('endocrine') }}
      >
        <nav aria-label={t('hormones.breadcrumbs')} className="mb-5 flex flex-wrap items-center gap-1.5 text-[14px] text-ink-soft">
          <Link to="/" className="text-ink-soft no-underline hover:text-ink">
            {t('site.name')}
          </Link>
          <ChevronRight size={14} aria-hidden />
          <Link to="/razdel/gormony" className="text-ink-soft no-underline hover:text-ink">
            {parent?.title ?? t('hormones.parentTitle')}
          </Link>
          <ChevronRight size={14} aria-hidden />
          <span aria-current="page" className="font-medium text-ink">
            {meta.title}
          </span>
        </nav>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] lg:gap-14">
          <div className="stage-host lg:sticky lg:top-[84px] lg:h-[calc(100dvh-108px)] lg:self-start">
            <Stage
              label={meta.title}
              description={content?.modelDescription ?? meta.tagline}
              camera={{ position: [2.4, 2.2, 10.6], fov: 32 }}
              target={[0, 0, 0]}
              floorY={-2.8}
              orbit={{ minDistance: 1.5, maxDistance: 36, free: true }}
              bounds={{ min: [-4.5, -3.2, -3.5], max: [4.5, 3.4, 3.5] }}
              modes={HORMONE_MODES}
              legend={legend}
              names={names}
              className="aspect-square max-h-[78vh] w-full lg:aspect-auto lg:h-full lg:max-h-none"
            >
              {(state) => <HormoneModel slug={meta.slug} accent={meta.accent} state={state} names={names} />}
            </Stage>
          </div>

          <div className="min-w-0 lg:pt-2">
            <header>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-semibold" style={{ color: 'var(--accent)' }}>
                  {meta.classLabel}
                </span>
                <span className="rounded-full border border-line bg-wash px-2.5 py-0.5 font-mono text-[13px] text-ink">
                  {meta.formula}
                </span>
              </div>
              <h1
                className={`m-0 mt-2 break-words font-extrabold leading-[0.94] tracking-[-0.05em] ${
                  meta.title.length > 14 ? 'text-[clamp(36px,5.4vw,72px)]' : 'text-[clamp(48px,7.6vw,96px)]'
                }`}
              >
                {meta.title}
              </h1>
              <p className="m-0 mt-3 font-display text-[17px] font-medium text-ink-soft">{meta.latin}</p>
              <p className="m-0 mt-5 max-w-[30ch] font-display text-[clamp(20px,2.2vw,25px)] font-medium leading-[1.32] tracking-[-0.015em]">
                {meta.tagline}
              </p>
              <div className="mt-4">
                <Link
                  to="/razdel/gormony"
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-plinth px-3.5 py-1.5 text-[14px] font-medium text-ink no-underline transition-colors hover:bg-wash"
                >
                  <ArrowLeft size={15} aria-hidden />
                  {t('hormones.backToAll')}
                </Link>
              </div>
            </header>

            {loadError && (
              <div role="alert" className="mt-10 flex flex-wrap items-center gap-4 rounded-[20px] border border-line bg-plinth p-5">
                <p className="m-0 text-ink-soft">{t('section.loadFailed')}</p>
                <button
                  type="button"
                  onClick={() => setAttempt((n) => n + 1)}
                  className="rounded-full bg-ink px-5 py-2.5 font-medium text-stone hover:opacity-90"
                >
                  {t('section.retry')}
                </button>
              </div>
            )}

            {content && (
              <>
                <StatCards stats={content.stats} />

                <Block title={t('section.does')}>
                  <Paragraphs items={content.does} />
                </Block>

                <Block title={t('hormones.production')}>
                  <Paragraphs items={content.production} />
                </Block>

                <Block title={t('hormones.structureAndPath')}>
                  <PartsList parts={content.parts} />
                </Block>

                <Block title={t('hormones.neutralized')}>
                  <Paragraphs items={content.neutralized} />
                </Block>

                <Block title={t('hormones.balance')}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[20px] border border-line bg-plinth p-5">
                      <p className="m-0 flex items-center gap-2 font-display text-[16px] font-bold text-ink">
                        <ShieldAlert size={18} aria-hidden style={{ color: 'var(--accent)' }} />
                        {t('hormones.excess')}
                      </p>
                      <p className="m-0 mt-2 text-[15px] leading-relaxed text-ink-soft">{content.balance.excess}</p>
                    </div>
                    <div className="rounded-[20px] border border-line bg-plinth p-5">
                      <p className="m-0 flex items-center gap-2 font-display text-[16px] font-bold text-ink">
                        <Scale size={18} aria-hidden style={{ color: 'var(--accent)' }} />
                        {t('hormones.deficit')}
                      </p>
                      <p className="m-0 mt-2 text-[15px] leading-relaxed text-ink-soft">{content.balance.deficit}</p>
                    </div>
                  </div>
                  <p className="mt-4 text-[14px] text-ink-soft">{t('section.careNote')}</p>
                </Block>

                <Block title={t('section.kid')}>
                  <KidSay lines={content.kidSay} />
                </Block>

                <Block title={t('section.facts')}>
                  <FactList facts={content.facts} />
                </Block>

                {siblingHormones.length > 0 && (
                  <Block title={t('hormones.relatedHormones')}>
                    <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
                      {siblingHormones.map((h) => (
                        <li key={h.slug}>
                          <Link
                            to={`/razdel/gormony/${h.slug}`}
                            className="flex h-full flex-col gap-1 rounded-[18px] border border-line bg-plinth p-4 text-ink no-underline transition-colors hover:border-ink"
                          >
                            <span className="flex items-center justify-between gap-2 font-display text-[17px] font-semibold">
                              <span className="flex items-center gap-2">
                                <span aria-hidden className="inline-block size-2.5 rounded-full" style={{ background: h.accent }} />
                                {h.title}
                              </span>
                              <span className="font-mono text-[12px] text-ink-soft">{h.formula}</span>
                            </span>
                            <span className="text-[14px] leading-snug text-ink-soft">{h.tagline}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </Block>
                )}

                <Block title={t('section.related')}>
                  <RelatedSections slugs={['gormony', ...meta.relatedSections]} />
                </Block>
              </>
            )}
          </div>
        </div>
      </article>
    </SelectionProvider>
  );
}
