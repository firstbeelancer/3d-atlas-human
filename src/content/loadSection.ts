import type { SectionContent } from './types';

/** Контент разделов грузится отдельными кусками, только когда раздел открыт. */
const LOADERS: Record<string, () => Promise<{ default: SectionContent }>> = {
  serdce: () => import('./ru/serdce'),
};

export async function loadSectionContent(slug: string): Promise<SectionContent | null> {
  const load = LOADERS[slug];
  if (!load) return null;
  return (await load()).default;
}

export function hasSectionContent(slug: string): boolean {
  return slug in LOADERS;
}
