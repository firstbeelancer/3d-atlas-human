import type { SectionContent } from './types';

/** Контент разделов грузится отдельными кусками, только когда раздел открыт. */
const LOADERS: Record<string, () => Promise<{ default: SectionContent }>> = {
  skelet: () => import('./ru/skelet'),
  serdce: () => import('./ru/serdce'),
  pechen: () => import('./ru/pechen'),
};

export async function loadSectionContent(slug: string): Promise<SectionContent | null> {
  const load = LOADERS[slug];
  if (!load) return null;
  return (await load()).default;
}

export function hasSectionContent(slug: string): boolean {
  return slug in LOADERS;
}
