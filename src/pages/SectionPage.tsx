import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { getSection } from '../content/sections';
import { systemColor, SYSTEMS } from '../content/systems';
import { loadSectionContent } from '../content/loadSection';
import type { Part, PartGroup, SectionContent } from '../content/types';
import { useDocumentMeta } from '../lib/meta';
import { t } from '../i18n';
import { ComingSoon } from '../components/section/ComingSoon';
import {
  Block,
  CareList,
  FactList,
  KidSay,
  Paragraphs,
  PartsList,
  RelatedSections,
  SectionHero,
  StatCards,
} from '../components/section/blocks';
import { MODELS } from '../models/registry';
import { Stage } from '../three/Stage';
import { SelectionProvider } from '../three/selection';
import { NotFoundPage } from './NotFoundPage';
import { AdultOnly } from '../components/AdultOnly';
import { useAdult } from '../lib/adult';
import { loadAdultContent } from '../content/adult/loadAdult';

const loadAdultNote = () => import('../content/adult/AdultSectionNote');

export function SectionPage() {
  const { slug = '' } = useParams();
  const section = getSection(slug);
  const [content, setContent] = useState<SectionContent | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { adult } = useAdult();
  const [adultExtra, setAdultExtra] = useState<{ slug: string; groups: PartGroup[]; parts: Part[] } | null>(null);
  useDocumentMeta(section?.title ?? null, section?.tagline);

  useEffect(() => {
    let alive = true;
    setContent(null);
    setLoadError(false);
    if (section?.ready) {
      loadSectionContent(section.slug)
        .then((c) => alive && setContent(c))
        .catch(() => alive && setLoadError(true));
    }
    return () => {
      alive = false;
    };
  }, [section, attempt]);

  // части 18+ добавляются к тексту раздела только при включённом режиме 18+
  useEffect(() => {
    let alive = true;
    setAdultExtra(null);
    if (adult && section?.adultParts) {
      loadAdultContent(section.slug)
        .then((c) => alive && c && setAdultExtra({ slug: section.slug, groups: c.adultGroups, parts: c.adultParts }))
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [adult, section]);

  const fullContent = useMemo(() => {
    if (content?.slug !== slug) return null;
    if (!adult || adultExtra?.slug !== slug) return content;
    return { ...content, groups: [...(content.groups ?? []), ...adultExtra.groups], parts: [...content.parts, ...adultExtra.parts] };
  }, [content, adult, adultExtra, slug]);

  const names = useMemo(
    () =>
      fullContent
        ? Object.fromEntries([...(fullContent.groups ?? []), ...fullContent.parts].map((p) => [p.id, p.name]))
        : undefined,
    [fullContent],
  );

  if (!section) return <NotFoundPage />;
  const systemTitle = SYSTEMS.find((s) => s.id === section.system)?.title ?? '';
  const model = MODELS[section.slug];

  return (
    <SelectionProvider key={section.slug}>
      <article
        className="mx-auto max-w-[1320px] px-4 pb-8 pt-6 sm:px-6 lg:pt-8"
        style={{ ['--accent' as string]: systemColor(section.system) }}
      >
        <div className={model ? 'grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-14' : ''}>
          {model && (
            <div className="stage-host lg:sticky lg:top-[84px] lg:h-[calc(100dvh-108px)] lg:self-start">
              <Stage
                label={section.title}
                description={model.description}
                hasCutaway={model.hasCutaway}
                initialCutaway={model.initialCutaway}
                camera={model.camera}
                modes={model.modes}
                legend={model.legend}
                names={names}
                target={model.target}
                floorY={model.floorY}
                orbit={model.orbit}
                explorer={model.explorer && fullContent ? { parts: fullContent.parts, groups: fullContent.groups, fundusKey: model.explorerFundusKey, cuts: model.explorerCuts } : undefined}
                adult={section.adultParts ? adult : undefined}
                bounds={model.bounds}
                minDistance={model.minDistance}
                mobileModeRoom={model.mobileModeRoom}
                className="aspect-square max-h-[78vh] w-full lg:aspect-auto lg:h-full lg:max-h-none"
              >
                {(state) => <model.Component state={state} names={names} />}
              </Stage>
            </div>
          )}

          <div className="min-w-0 lg:pt-4">
            <SectionHero section={section} systemTitle={systemTitle} />
            {section.adultParts && <AdultOnly load={loadAdultNote} />}
            {!section.ready && <ComingSoon />}
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
            {fullContent && (
              <>
                <StatCards stats={fullContent.stats} />
                <Block title={t('section.does')}>
                  <Paragraphs items={fullContent.does} />
                </Block>
                <Block title={t('section.parts')}>
                  <PartsList parts={fullContent.parts} groups={fullContent.groups} canIsolate={!!model?.isolate} />
                </Block>
                <Block title={t('section.kid')}>
                  <KidSay lines={fullContent.kidSay} />
                </Block>
                <Block title={t('section.facts')}>
                  <FactList facts={fullContent.facts} />
                </Block>
                <Block title={t('section.care')}>
                  <CareList items={fullContent.care} />
                </Block>
                <Block title={t('section.related')}>
                  <RelatedSections slugs={fullContent.related} />
                </Block>
              </>
            )}
          </div>
        </div>
      </article>
    </SelectionProvider>
  );
}
