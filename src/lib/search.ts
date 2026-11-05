import { SECTIONS } from '../content/sections';
import type { Part } from '../content/types';

export interface SearchResult {
  slug: string;
  title: string;
  /** Что именно совпало: название раздела или части. */
  match: string;
}

export function normalize(s: string): string {
  return s.toLowerCase().replace(/\u0451/g, '\u0435').trim();
}

/** Поиск по названиям, латыни и подзаголовкам разделов, а также по названиям частей органов. */
export function search(query: string, parts: Record<string, Part[]> = {}): SearchResult[] {
  const q = normalize(query);
  if (!q) return [];
  const byTitle: SearchResult[] = [];
  const byPart: SearchResult[] = [];
  const byOther: SearchResult[] = [];
  const seen = new Set<string>();

  for (const s of SECTIONS) {
    if (normalize(s.title).includes(q)) {
      byTitle.push({ slug: s.slug, title: s.title, match: s.title });
      seen.add(s.slug);
    }
  }
  for (const s of SECTIONS) {
    if (seen.has(s.slug)) continue;
    const part = parts[s.slug]?.find((p) => normalize(p.name).includes(q) || (p.latin && normalize(p.latin).includes(q)));
    if (part) {
      byPart.push({ slug: s.slug, title: s.title, match: part.name });
      seen.add(s.slug);
    }
  }
  for (const s of SECTIONS) {
    if (seen.has(s.slug)) continue;
    if (normalize(s.latin).includes(q) || normalize(s.tagline).includes(q)) {
      byOther.push({ slug: s.slug, title: s.title, match: s.title });
      seen.add(s.slug);
    }
  }
  return [...byTitle, ...byPart, ...byOther];
}
