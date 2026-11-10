import type { SectionBase, SectionMeta } from '../types';
import { sectionTexts } from '../ru/sections';

/** Реестр разделов. Тексты берутся из файлов языка. */
const BASE: SectionBase[] = [
  { slug: 'kletki-i-belki', system: 'cells', icon: 'cell', ready: false },
  { slug: 'skelet', system: 'support', icon: 'skeleton', ready: true },
  { slug: 'myshcy', system: 'support', icon: 'muscle', ready: true },
  { slug: 'vnutrennie-organy', system: 'overview', icon: 'organs', ready: false },
  { slug: 'mozg', system: 'nervous', icon: 'brain', ready: true },
  { slug: 'glaz', system: 'nervous', icon: 'eye', ready: true },
  { slug: 'uho', system: 'nervous', icon: 'ear', ready: true },
  { slug: 'zub', system: 'digestive', icon: 'tooth', ready: true },
  { slug: 'legkie', system: 'respiratory', icon: 'lungs', ready: true },
  { slug: 'serdce', system: 'circulatory', icon: 'heart', ready: true },
  { slug: 'selezenka', system: 'lymphatic', icon: 'spleen', ready: true },
  { slug: 'zheludok', system: 'digestive', icon: 'stomach', ready: true },
  { slug: 'pechen', system: 'digestive', icon: 'liver', ready: true },
  { slug: 'podzheludochnaya', system: 'digestive', icon: 'pancreas', ready: true },
  { slug: 'zhelchnyj-puzyr', system: 'digestive', icon: 'gallbladder', ready: true },
  { slug: 'pochki', system: 'urinary', icon: 'kidneys', ready: true },
  { slug: 'mochevoj-puzyr', system: 'urinary', icon: 'bladder', ready: true },
  { slug: 'kishechnik', system: 'digestive', icon: 'intestine', ready: true },
  { slug: 'zhenskaya-reproduktivnaya', system: 'reproductive', icon: 'uterus', ready: true, adultParts: true },
  { slug: 'muzhskaya-reproduktivnaya', system: 'reproductive', icon: 'testis', ready: false, adultParts: true },
  { slug: 'krovenosnaya-sistema', system: 'circulatory', icon: 'vessels', ready: true },
  { slug: 'volosy-i-nogti', system: 'skin', icon: 'hair', ready: true },
  { slug: 'beremennost', system: 'reproductive', icon: 'pregnancy', ready: false, adultParts: true },
  { slug: 'gormony', system: 'endocrine', icon: 'hormones', ready: false },
];

export const SECTIONS: SectionMeta[] = BASE.map((base) => {
  const texts = sectionTexts[base.slug];
  if (!texts) throw new Error(`Нет текстов для раздела ${base.slug}`);
  return { ...base, ...texts };
});

const BY_SLUG = new Map(SECTIONS.map((s) => [s.slug, s]));

export function getSection(slug: string): SectionMeta | undefined {
  return BY_SLUG.get(slug);
}
