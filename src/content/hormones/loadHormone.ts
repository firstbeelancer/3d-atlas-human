import type { HormoneDetailContent } from './types';

const PART1 = new Set([
  'adrenalin',
  'noradrenalin',
  'kortizol',
  'serotonin',
  'dofamin',
  'endorfin',
  'oksitocin',
  'melatonin',
  'tiroksin',
]);

/** Подробный текст гормона грузится отдельным чанком только при открытии его страницы. */
export async function loadHormoneContent(slug: string): Promise<HormoneDetailContent | null> {
  if (PART1.has(slug)) {
    const mod = await import('../ru/hormones/detailsPart1');
    return mod.HORMONE_DETAILS_PART1[slug] ?? null;
  }
  const mod = await import('../ru/hormones/detailsPart2');
  return mod.HORMONE_DETAILS_PART2[slug] ?? null;
}
