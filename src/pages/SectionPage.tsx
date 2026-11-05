import { Suspense, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { getSection } from '../content/sections';
import { systemColor, SYSTEMS } from '../content/systems';
import { loadSectionContent } from '../content/loadSection';
import type { SectionContent } from '../content/types';
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

export function SectionPage() {
  const { slug = '' } = useParams();
  const section = getSection(slug);
  const [content, setContent] = useState<SectionContent | null>(null);
  useDocumentMeta(section?.title ?? null, section?.tagline);

  useEffect(() => {
    let alive = true;
    setContent(null);
    if (section?.ready) {
      loadSectionContent(section.slug).then((c) => alive && setContent(c));
    }
    return () => {
      alive = false;
    };
  }, [section]);

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
                camera={model.camera}
                target={model.target}
                className="aspect-square max-h-[78vh] w-full lg:aspect-auto lg:h-full lg:max-h-none"
              >
                {(state) => (
                  <Suspense fallback={null}>
                    <model.Component state={state} />
                  </Suspense>
                )}
              </Stage>
            </div>
          )}

          <div className="min-w-0 lg:pt-4">
            <SectionHero section={section} systemTitle={systemTitle} />
            {!section.ready && <ComingSoon />}
            {content && (
              <>
                <StatCards stats={content.stats} />
                <Block title={t('section.does')}>
                  <Paragraphs items={content.does} />
                </Block>
                <Block title={t('section.parts')}>
                  <PartsList parts={content.parts} />
                </Block>
                <Block title={t('section.kid')}>
                  <KidSay lines={content.kidSay} />
                </Block>
                <Block title={t('section.facts')}>
                  <FactList facts={content.facts} />
                </Block>
                <Block title={t('section.care')}>
                  <CareList items={content.care} />
                </Block>
                <Block title={t('section.related')}>
                  <RelatedSections slugs={content.related} />
                </Block>
              </>
            )}
          </div>
        </div>
      </article>
    </SelectionProvider>
  );
}
