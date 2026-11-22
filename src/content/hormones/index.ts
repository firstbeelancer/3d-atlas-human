import type { HormoneBase, HormoneCategoryId, HormoneCategoryMeta, HormoneMeta } from './types';
import { hormoneCategoryTexts, hormoneMetaTexts } from '../ru/hormones/catalog';

const CATEGORY_ORDER: HormoneCategoryId[] = ['stress', 'mood', 'metabolism', 'balance', 'reproduction'];

export const HORMONE_CATEGORIES: HormoneCategoryMeta[] = CATEGORY_ORDER.map((id) => ({
  id,
  ...hormoneCategoryTexts[id],
}));

const BASE: HormoneBase[] = [
  {
    slug: 'adrenalin',
    category: 'stress',
    chemClass: 'amine',
    formula: 'C₉H₁₃NO₃',
    accent: '#e0523c',
    relatedSections: ['serdce', 'legkie', 'nervnaya-sistema', 'pechen'],
    relatedHormones: ['noradrenalin', 'kortizol', 'endorfin', 'glukagon'],
  },
  {
    slug: 'noradrenalin',
    category: 'stress',
    chemClass: 'amine',
    formula: 'C₈H₁₁NO₃',
    accent: '#d96b2b',
    relatedSections: ['nervnaya-sistema', 'krovenosnaya-sistema', 'mozg', 'serdce'],
    relatedHormones: ['adrenalin', 'dofamin', 'kortizol', 'melatonin'],
  },
  {
    slug: 'kortizol',
    category: 'stress',
    chemClass: 'steroid',
    formula: 'C₂₁H₃₀O₅',
    accent: '#d99a1e',
    relatedSections: ['pechen', 'mozg', 'selezenka', 'pochki'],
    relatedHormones: ['adrenalin', 'melatonin', 'insulin', 'testosteron'],
  },
  {
    slug: 'serotonin',
    category: 'mood',
    chemClass: 'amine',
    formula: 'C₁₀H₁₂N₂O',
    accent: '#2aa89b',
    relatedSections: ['mozg', 'kishechnik', 'nervnaya-sistema', 'krovenosnaya-sistema'],
    relatedHormones: ['melatonin', 'dofamin', 'oksitocin', 'kortizol'],
  },
  {
    slug: 'dofamin',
    category: 'mood',
    chemClass: 'amine',
    formula: 'C₈H₁₁NO₂',
    accent: '#4a6fe0',
    relatedSections: ['mozg', 'nervnaya-sistema', 'myshcy'],
    relatedHormones: ['noradrenalin', 'serotonin', 'endorfin', 'oksitocin'],
  },
  {
    slug: 'endorfin',
    category: 'mood',
    chemClass: 'peptide',
    formula: '31 aa',
    accent: '#9155d6',
    relatedSections: ['mozg', 'nervnaya-sistema', 'myshcy'],
    relatedHormones: ['adrenalin', 'dofamin', 'serotonin', 'oksitocin'],
  },
  {
    slug: 'oksitocin',
    category: 'mood',
    chemClass: 'peptide',
    formula: '9 aa',
    accent: '#d65384',
    relatedSections: ['mozg', 'zhenskaya-reproduktivnaya', 'nervnaya-sistema'],
    relatedHormones: ['vazopressin', 'serotonin', 'endorfin', 'adrenalin'],
  },
  {
    slug: 'melatonin',
    category: 'metabolism',
    chemClass: 'amine',
    formula: 'C₁₃H₁₆N₂O₂',
    accent: '#5a5ec4',
    relatedSections: ['mozg', 'glaz', 'nervnaya-sistema'],
    relatedHormones: ['serotonin', 'kortizol', 'somatotropin', 'noradrenalin'],
  },
  {
    slug: 'tiroksin',
    category: 'metabolism',
    chemClass: 'iodothyronine',
    formula: 'C₁₅H₁₁I₄NO₄',
    accent: '#8a46b8',
    relatedSections: ['serdce', 'mozg', 'pechen', 'myshcy'],
    relatedHormones: ['somatotropin', 'adrenalin', 'kortizol', 'paratgormon'],
  },
  {
    slug: 'somatotropin',
    category: 'metabolism',
    chemClass: 'peptide',
    formula: '191 aa',
    accent: '#3b8ec4',
    relatedSections: ['skelet', 'myshcy', 'pechen', 'mozg'],
    relatedHormones: ['insulin', 'tiroksin', 'melatonin', 'testosteron'],
  },
  {
    slug: 'insulin',
    category: 'balance',
    chemClass: 'peptide',
    formula: '51 aa',
    accent: '#2c9665',
    relatedSections: ['podzheludochnaya', 'pechen', 'myshcy', 'krovenosnaya-sistema'],
    relatedHormones: ['glukagon', 'kortizol', 'adrenalin', 'leptin'],
  },
  {
    slug: 'glukagon',
    category: 'balance',
    chemClass: 'peptide',
    formula: '29 aa',
    accent: '#cc8220',
    relatedSections: ['podzheludochnaya', 'pechen', 'krovenosnaya-sistema'],
    relatedHormones: ['insulin', 'adrenalin', 'kortizol', 'somatotropin'],
  },
  {
    slug: 'leptin',
    category: 'balance',
    chemClass: 'peptide',
    formula: '167 aa',
    accent: '#4a9e42',
    relatedSections: ['mozg', 'zheludok', 'kishechnik', 'kozha'],
    relatedHormones: ['insulin', 'kortizol', 'tiroksin', 'estrogeny'],
  },
  {
    slug: 'vazopressin',
    category: 'balance',
    chemClass: 'peptide',
    formula: '9 aa',
    accent: '#247ba8',
    relatedSections: ['pochki', 'mochevoj-puzyr', 'krovenosnaya-sistema', 'mozg'],
    relatedHormones: ['oksitocin', 'aldosteron', 'kortizol', 'noradrenalin'],
  },
  {
    slug: 'aldosteron',
    category: 'balance',
    chemClass: 'steroid',
    formula: 'C₂₁H₂₈O₅',
    accent: '#b88318',
    relatedSections: ['pochki', 'krovenosnaya-sistema', 'serdce'],
    relatedHormones: ['vazopressin', 'kortizol', 'noradrenalin', 'paratgormon'],
  },
  {
    slug: 'paratgormon',
    category: 'balance',
    chemClass: 'peptide',
    formula: '84 aa',
    accent: '#c49622',
    relatedSections: ['skelet', 'pochki', 'kishechnik', 'zub'],
    relatedHormones: ['tiroksin', 'aldosteron', 'estrogeny', 'somatotropin'],
  },
  {
    slug: 'testosteron',
    category: 'reproduction',
    chemClass: 'steroid',
    formula: 'C₁₉H₂₈O₂',
    accent: '#3d6ea8',
    relatedSections: ['myshcy', 'skelet', 'volosy', 'mozg'],
    relatedHormones: ['estrogeny', 'kortizol', 'somatotropin', 'dofamin'],
  },
  {
    slug: 'estrogeny',
    category: 'reproduction',
    chemClass: 'steroid',
    formula: 'C₁₈H₂₄O₂',
    accent: '#c44d75',
    relatedSections: ['zhenskaya-reproduktivnaya', 'skelet', 'krovenosnaya-sistema', 'kozha'],
    relatedHormones: ['testosteron', 'oksitocin', 'serotonin', 'tiroksin'],
  },
];

export const HORMONES: HormoneMeta[] = BASE.map((b) => {
  const texts = hormoneMetaTexts[b.slug];
  if (!texts) throw new Error(`Missing texts for hormone ${b.slug}`);
  return { ...b, ...texts };
});

const BY_SLUG = new Map(HORMONES.map((h) => [h.slug, h]));

export function getHormone(slug: string): HormoneMeta | undefined {
  return BY_SLUG.get(slug);
}
