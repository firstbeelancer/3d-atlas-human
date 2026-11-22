import type { Part, Stat } from '../types';

export type HormoneCategoryId = 'stress' | 'mood' | 'metabolism' | 'balance' | 'reproduction';

export type HormoneClass = 'amine' | 'steroid' | 'peptide' | 'iodothyronine';

export interface HormoneBase {
  slug: string;
  category: HormoneCategoryId;
  chemClass: HormoneClass;
  /** Химическая формула или размер цепи (например, C9H13NO3 или 51 aa). */
  formula: string;
  /** Акцентный цвет молекулы и пути в 3D-сцене. */
  accent: string;
  /** Связанные разделы органов атласа. */
  relatedSections: string[];
  /** Связанные гормоны (синергисты и антагонисты). */
  relatedHormones: string[];
}

export interface HormoneMetaTexts {
  title: string;
  latin: string;
  tagline: string;
  sourceShort: string;
  classLabel: string;
}

export type HormoneMeta = HormoneBase & HormoneMetaTexts;

export interface HormoneCategoryMeta {
  id: HormoneCategoryId;
  title: string;
  subtitle: string;
}

export interface HormoneDetailContent {
  slug: string;
  /** Короткое описание 3D-сцены для скринридеров и браузеров без WebGL. */
  modelDescription: string;
  stats: Stat[];
  /** Что делает гормон в организме. */
  does: string[];
  /** Как синтезируется, что запускает выброс и откуда поступает. */
  production: string[];
  /** Интерактивные части 3D-модели (функциональные группы молекулы + источник/мишени/тормоз в теле). */
  parts: Part[];
  /** Чем нивелируется, какие антагонисты и ферменты его выключают и как организм возвращает баланс. */
  neutralized: string[];
  /** Что происходит при избытке и при нехватке гормона (информационно). */
  balance: {
    excess: string;
    deficit: string;
  };
  /** Как объяснить ребёнку. */
  kidSay: string[];
  /** Проверенные интересные факты. */
  facts: string[];
}
