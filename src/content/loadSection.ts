import type { SectionContent } from './types';

/** Контент разделов грузится отдельными кусками, только когда раздел открыт. */
const LOADERS: Record<string, () => Promise<{ default: SectionContent }>> = {
  skelet: () => import('./ru/skelet'),
  myshcy: () => import('./ru/myshcy'),
  serdce: () => import('./ru/serdce'),
  'krovenosnaya-sistema': () => import('./ru/krovenosnaya-sistema'),
  selezenka: () => import('./ru/selezenka'),
  glaz: () => import('./ru/glaz'),
  pechen: () => import('./ru/pechen'),
  zheludok: () => import('./ru/zheludok'),
  zub: () => import('./ru/zub'),
  'mochevoj-puzyr': () => import('./ru/mochevoj-puzyr'),
  legkie: () => import('./ru/legkie'),
  kishechnik: () => import('./ru/kishechnik'),
  'zhelchnyj-puzyr': () => import('./ru/zhelchnyj-puzyr'),
  mozg: () => import('./ru/mozg'),
  uho: () => import('./ru/uho'),
  podzheludochnaya: () => import('./ru/podzheludochnaya'),
  pochki: () => import('./ru/pochki'),
};

export async function loadSectionContent(slug: string): Promise<SectionContent | null> {
  const load = LOADERS[slug];
  if (!load) return null;
  return (await load()).default;
}

export function hasSectionContent(slug: string): boolean {
  return slug in LOADERS;
}
