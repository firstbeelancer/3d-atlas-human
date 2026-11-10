import type { Part, PartGroup } from '../types';

interface AdultContent {
  adultGroups: PartGroup[];
  adultParts: Part[];
}

/** Тексты 18+ грузятся отдельным куском и только при включённом режиме 18+. */
const LOADERS: Record<string, () => Promise<AdultContent>> = {
  'zhenskaya-reproduktivnaya': () => import('../ru/adult/zhenskaya-vulva'),
};

export async function loadAdultContent(slug: string): Promise<AdultContent | null> {
  const load = LOADERS[slug];
  return load ? load() : null;
}
