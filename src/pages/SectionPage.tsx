import { useParams } from 'react-router';
import { getSection } from '../content/sections';
import { systemColor, SYSTEMS } from '../content/systems';
import { useDocumentMeta } from '../lib/meta';
import { ComingSoon } from '../components/section/ComingSoon';
import { NotFoundPage } from './NotFoundPage';

export function SectionPage() {
  const { slug = '' } = useParams();
  const section = getSection(slug);
  useDocumentMeta(section?.title ?? null, section?.tagline);
  if (!section) return <NotFoundPage />;
  const system = SYSTEMS.find((s) => s.id === section.system);

  return (
    <article
      className="mx-auto max-w-[1240px] px-4 py-12 sm:px-6"
      style={{ ['--accent' as string]: systemColor(section.system) }}
    >
      <p className="m-0 text-[15px] font-medium" style={{ color: 'var(--accent)' }}>
        {system?.title}
      </p>
      <h1 className="m-0 mt-2 text-[clamp(44px,8vw,104px)] font-bold leading-[0.95] tracking-[-0.045em]">
        {section.title}
      </h1>
      <p className="mt-3 text-ink-soft">{section.latin}</p>
      <p className="mt-4 max-w-[30ch] font-display text-[clamp(20px,2.4vw,26px)] font-medium leading-snug tracking-[-0.01em]">
        {section.tagline}
      </p>
      {!section.ready && <ComingSoon />}
    </article>
  );
}
