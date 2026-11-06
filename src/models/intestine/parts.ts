import type { V3 } from './anatomy';

/** Части модели кишечника (id совпадают с пунктами «Из чего состоит») и их группы. */
export const INTESTINE_GROUPS = {
  'g-small': ['duodenum', 'duodenal-papilla', 'treitz', 'jejunum', 'ileum', 'ileocecal-valve'],
  'g-large': ['cecum', 'appendix', 'ascending', 'hepatic-flexure', 'transverse', 'splenic-flexure', 'descending', 'sigmoid'],
  'g-features': ['taeniae', 'haustra', 'epiploic-appendages'],
  'g-exit': ['rectum', 'rectal-folds', 'anal-canal', 'internal-sphincter', 'external-sphincter', 'puborectalis'],
  'g-wall': ['serosa', 'muscularis', 'submucosa', 'mucosa'],
  'g-contents': ['chyme', 'feces'],
  'g-supply': ['mesentery', 'sma', 'smv', 'ima', 'lymph-nodes', 'nerves'],
  'g-micro': [
    'plicae',
    'villi',
    'crypts',
    'goblet-cells',
    'lacteal',
    'capillaries',
    'muscularis-mucosae',
    'peyers-patches',
    'submucosal-plexus',
    'myenteric-plexus',
  ],
  'g-neighbors': ['stomach', 'pancreas', 'greater-omentum', 'aorta', 'ivc'],
} as const;

export type IntestineGroupId = keyof typeof INTESTINE_GROUPS;

export const INTESTINE_PART_IDS: string[] = Object.values(INTESTINE_GROUPS).flat();

export const GROUP_OF: Record<string, IntestineGroupId> = Object.fromEntries(
  (Object.entries(INTESTINE_GROUPS) as [IntestineGroupId, readonly string[]][]).flatMap(([g, ids]) => ids.map((id) => [id, g])),
);

/** Части, которые видны только на срезе стенки «под микроскопом»: выбор любой из них включает этот вид. */
export const MICRO_ONLY = new Set<string>(INTESTINE_GROUPS['g-micro']);
/** Части, которые есть и на макромодели, и на срезе стенки. */
export const MICRO_SHARED = new Set<string>(['serosa', 'muscularis', 'submucosa', 'mucosa']);

/** Части макромодели (всё, кроме «только под микроскопом»). */
export const MACRO_PART_IDS: string[] = INTESTINE_PART_IDS.filter((id) => !MICRO_ONLY.has(id));

/** Отделы кишки, к которым привязана геометрия (для разноса на части). */
export const SEGMENTS = [
  'duodenum',
  'jejunum',
  'ileum',
  'cecum',
  'appendix',
  'ascending',
  'hepatic-flexure',
  'transverse',
  'splenic-flexure',
  'descending',
  'sigmoid',
  'rectum',
  'anal-canal',
] as const;
export type SegmentId = (typeof SEGMENTS)[number];

/** Когда выбрана часть-«признак», эти отделы светятся вместе с ней. */
export const GLOW_ALSO: Record<string, readonly string[]> = {
  haustra: ['cecum', 'ascending', 'hepatic-flexure', 'transverse', 'splenic-flexure', 'descending', 'sigmoid'],
};

/* ---------- Камера ---------- */

/** Точка, на которую смотрит камера при выборе части, направление на камеру и расстояние. */
export interface Focus {
  at: V3;
  dir: V3;
  dist: number;
}

const FRONT: V3 = [0.22, 0.16, 0.96];
const f = (at: V3, dist: number, dir: V3 = FRONT): Focus => ({ at, dir, dist });

export const OVERVIEW: Focus = f([0.2, -2.6, -0.3], 31, [0.16, 0.08, 0.98]);
/** Фронтальный разрез: спереди чуть сверху. */
export const CUT_VIEW: Focus = f([0.2, -2.6, -0.5], 29, [0.1, 0.14, 0.98]);
/** Срез сверху: смотрим в разрез на нижний этаж живота. */
export const AXIAL_VIEW: Focus = f([0.2, -4.2, -0.6], 24, [0.1, 0.95, 0.3]);
/** Разнос на части: чуть сбоку, чтобы слои читались по очереди. */
export const SPREAD_VIEW: Focus = f([0.4, -2.5, -0.6], 46, [0.36, 0.2, 0.9]);

export const FOCUS: Record<string, Focus> = {
  duodenum: f([-1.5, 1.4, -1.1], 9.5),
  'duodenal-papilla': f([-1.6, 1.85, -1.1], 5.2, [0.3, 0.1, 0.95]),
  treitz: f([0.8, 1.5, -1.4], 6.5),
  jejunum: f([1.1, -0.6, 0.1], 10.5),
  ileum: f([-0.3, -2.6, 0.1], 11),
  'ileocecal-valve': f([-2.9, -2.76, -0.1], 5.2, [0.35, 0.18, 0.92]),
  cecum: f([-3.4, -3.3, -0.2], 7),
  appendix: f([-2.5, -4.4, -0.2], 5.4, [0.2, -0.1, 0.97]),
  ascending: f([-3.7, -0.4, -0.3], 8.6),
  'hepatic-flexure': f([-3.2, 2.6, -0.1], 7.4),
  transverse: f([0.2, 2.2, 0.3], 11.5),
  'splenic-flexure': f([3.8, 3.4, -0.3], 7.6, [-0.1, 0.2, 0.97]),
  descending: f([4.1, 0.2, -0.5], 9.5, [-0.2, 0.12, 0.97]),
  sigmoid: f([2.0, -4.5, 0.0], 8.6, [0.1, 0.3, 0.95]),
  taeniae: f([-3.7, 0.4, -0.3], 6.4),
  haustra: f([-0.6, 2.0, 0.3], 7.2, [0.1, 0.4, 0.9]),
  'epiploic-appendages': f([2.0, -4.4, 0.2], 6.2, [0.1, 0.4, 0.9]),
  rectum: f([0, -7.7, -1.1], 7.4, [0.45, 0.15, 0.88]),
  'rectal-folds': f([0, -7.7, -1.2], 5.4, [0.2, 0.2, 0.96]),
  'anal-canal': f([0, -9.9, -0.4], 5.2, [0.4, 0.1, 0.91]),
  'internal-sphincter': f([0, -9.55, -0.4], 4.4, [0.5, 0.1, 0.86]),
  'external-sphincter': f([0, -10.0, -0.3], 4.4, [0.5, 0.1, 0.86]),
  puborectalis: f([0, -8.8, -0.3], 6.4, [0.7, 0.55, 0.45]),
  serosa: f([4.4, -0.4, -0.3], 8.4),
  muscularis: f([1.0, 2.1, 0.2], 6.5),
  submucosa: f([1.0, 2.0, 0.2], 6.5),
  mucosa: f([0.8, 1.9, 0.2], 6.2, [0.15, 0.3, 0.94]),
  chyme: f([1.2, -0.4, -0.2], 8.8),
  feces: f([-3.7, 0.4, -0.3], 7.2),
  mesentery: f([-0.6, -1.3, -1.3], 12.5, [0.5, 0.2, 0.84]),
  sma: f([0.3, 0.2, -1.5], 9.2, [0.4, 0.2, 0.89]),
  smv: f([-0.2, 0.1, -1.5], 9.2, [0.4, 0.2, 0.89]),
  ima: f([2.0, -2.8, -1.3], 9.4, [0.3, 0.3, 0.9]),
  'lymph-nodes': f([-1.2, -1.8, -1.1], 9, [0.4, 0.2, 0.89]),
  nerves: f([0.5, 0.0, -1.5], 8.2, [0.4, 0.2, 0.89]),
  stomach: f([1.6, 4.3, -0.5], 10.5),
  pancreas: f([0.9, 2.4, -1.2], 10, [0.2, 0.3, 0.93]),
  'greater-omentum': f([0.4, -0.6, 0.8], 15, [0.15, 0.1, 0.98]),
  aorta: f([0.4, -1.5, -1.9], 15, [0.25, 0.1, 0.96]),
  ivc: f([-0.5, -1.5, -1.9], 15, [0.25, 0.1, 0.96]),
  'g-small': f([-0.4, -0.4, -0.3], 16),
  'g-large': OVERVIEW,
  'g-features': f([0.2, 1.0, 0.2], 17),
  'g-exit': f([0, -8.6, -0.7], 11.5, [0.45, 0.2, 0.87]),
  'g-wall': f([1.0, 2.0, 0.2], 8.5),
  'g-contents': f([0, -1.5, -0.2], 22),
  'g-supply': f([0.2, -1.0, -1.3], 16, [0.35, 0.2, 0.91]),
  'g-neighbors': f([0.3, 0.8, -1.4], 22),
};

/** Разнос при «Разобрать»: сдвиг отдела целиком. Всё, что привязано к отделу (слои, тении, содержимое), едет вместе с ним. */
export const SEG_SPREAD: Record<SegmentId, V3> = {
  duodenum: [-1.5, 0.9, -1.0],
  jejunum: [1.9, 0.7, 1.4],
  ileum: [-0.8, -1.8, 1.9],
  cecum: [-1.6, -1.4, 0.6],
  appendix: [-2.3, -2.4, 0.8],
  ascending: [-1.9, 0, 0.3],
  'hepatic-flexure': [-1.9, 1.2, 0.2],
  transverse: [0, 1.9, 1.2],
  'splenic-flexure': [2.0, 1.3, -0.1],
  descending: [2.1, 0, 0.2],
  sigmoid: [1.7, -1.6, 0.5],
  rectum: [0, -1.4, -0.6],
  'anal-canal': [0, -2.8, -0.2],
};

/**
 * Разнос слоёв и самостоятельных частей. Слои уезжают по диагонали назад,
 * чтобы друг друга не закрывать; сосуды и соседи — отдельно.
 */
export const PART_SPREAD: Record<string, V3> = {
  serosa: [-0.5, 0.3, 1.5],
  muscularis: [0.7, -0.1, -1.0],
  submucosa: [1.4, -0.3, -2.1],
  mucosa: [2.1, -0.5, -3.2],
  chyme: [2.8, -0.7, -4.2],
  feces: [2.8, -0.7, -4.2],
  haustra: [2.1, -0.5, -3.2],
  'rectal-folds': [2.1, -0.5, -3.2],
  taeniae: [-0.4, 0.4, 0.9],
  'epiploic-appendages': [-0.8, 0.5, 0.9],
  'duodenal-papilla': [0.6, 0, -0.8],
  'ileocecal-valve': [0.9, 0, -0.6],
  'internal-sphincter': [0.6, 0, 0],
  'external-sphincter': [-0.6, 0, 0],
  puborectalis: [0, 0.4, 1.0],
  mesentery: [0, 0.2, -0.9],
  sma: [0.9, 0.2, -1.6],
  smv: [-0.4, 0.2, -1.6],
  ima: [0.9, -0.3, -1.6],
  'lymph-nodes': [-0.8, -0.3, -1.1],
  nerves: [1.3, 0.2, -1.8],
  stomach: [0.9, 2.3, -0.6],
  pancreas: [0.6, 1.6, -1.2],
  'greater-omentum': [0, 0.5, 2.0],
  aorta: [0.3, 0, -2.2],
  ivc: [-0.4, 0, -2.2],
};

/** Какому отделу принадлежат части со «своей» геометрией (чтобы ехали вместе с ним). */
export const ATTACHED_TO: Record<string, SegmentId> = {
  'duodenal-papilla': 'duodenum',
  treitz: 'duodenum',
  'ileocecal-valve': 'cecum',
  'rectal-folds': 'rectum',
  'internal-sphincter': 'anal-canal',
  'external-sphincter': 'anal-canal',
  puborectalis: 'anal-canal',
};

/** Якоря подписей на модели (координаты сцены). */
export const LABEL_AT: Record<string, V3> = {
  duodenum: [-1.95, 1.2, -0.66],
  'duodenal-papilla': [-1.64, 1.85, -1.1],
  treitz: [0.8, 1.7, -1.5],
  jejunum: [2.4, -0.05, 0.52],
  ileum: [0.3, -3.05, 0.52],
  'ileocecal-valve': [-2.78, -2.76, -0.1],
  cecum: [-3.55, -3.35, 0.72],
  appendix: [-2.6, -4.7, -0.2],
  ascending: [-3.74, -0.6, 0.5],
  'hepatic-flexure': [-3.3, 3.2, 0.62],
  transverse: [-0.4, 1.9, 0.98],
  'splenic-flexure': [4.0, 3.95, 0.2],
  descending: [4.3, 0.2, 0.2],
  sigmoid: [2.2, -4.7, 0.8],
  taeniae: [-3.74, 0.9, 0.48],
  haustra: [-0.5, 1.9, 1.0],
  'epiploic-appendages': [2.0, -4.15, 0.92],
  rectum: [0, -7.6, -0.5],
  'rectal-folds': [0, -7.7, -1.3],
  'anal-canal': [0, -9.8, 0.1],
  'internal-sphincter': [0.5, -9.4, -0.2],
  'external-sphincter': [0.6, -10.05, -0.1],
  puborectalis: [1.05, -8.85, 0.45],
  serosa: [4.85, -0.8, -0.4],
  muscularis: [1.2, 2.0, 0.3],
  submucosa: [1.0, 1.8, 0.3],
  mucosa: [0.8, 1.9, -0.3],
  chyme: [1.5, 0.45, -0.55],
  feces: [-3.74, 0.2, -0.36],
  mesentery: [-0.8, -1.5, -1.25],
  sma: [0.3, 0.5, -1.45],
  smv: [-0.2, 0.3, -1.5],
  ima: [1.6, -3.3, -1.6],
  'lymph-nodes': [-1.2, -1.9, -1.1],
  nerves: [0.65, 0.2, -1.4],
  stomach: [2.2, 4.9, -0.1],
  pancreas: [-0.3, 1.6, -0.95],
  'greater-omentum': [2.5, -1.8, 1.0],
  aorta: [0.45, -5.0, -1.8],
  ivc: [-0.6, -5.0, -1.85],
};

/** Какие части подписаны на модели сразу (остальные — при выборе). */
export const MAIN_LABELS = new Set([
  'duodenum',
  'jejunum',
  'ileum',
  'cecum',
  'appendix',
  'ascending',
  'transverse',
  'descending',
  'sigmoid',
  'rectum',
  'anal-canal',
  'stomach',
]);

/** Подписи внутренних частей видны сквозь стенки и не прячутся при повороте. */
export const INNER_LABELS = new Set([
  'duodenal-papilla',
  'ileocecal-valve',
  'rectal-folds',
  'mucosa',
  'submucosa',
  'muscularis',
  'chyme',
  'feces',
  'haustra',
  'internal-sphincter',
]);

/* ---------- Разрезы: свои плоскости для таза ---------- */

/** Плоскость фронтального разреза: срезается всё, что впереди z. */
export const CUT_Z = -0.1;
/** Плоскость горизонтального среза: срезается всё выше y. */
export const CUT_Y = -0.35;

const PELVIC_Z = -1.25;
const ANAL_Z = -0.42;
const PELVIC_Y = -8.2;
const ANAL_Y = -9.65;

/** У таза прямая кишка лежит глубже и ниже, поэтому плоскости разреза у неё свои. */
export const CUT_Z_OF: Record<string, number> = {
  rectum: PELVIC_Z,
  'rectal-folds': PELVIC_Z,
  'anal-canal': ANAL_Z,
  'internal-sphincter': ANAL_Z,
  'external-sphincter': ANAL_Z,
  puborectalis: ANAL_Z,
};
export const CUT_Y_OF: Record<string, number> = {
  rectum: PELVIC_Y,
  'rectal-folds': PELVIC_Y,
  'anal-canal': ANAL_Y,
  'internal-sphincter': ANAL_Y,
  'external-sphincter': ANAL_Y,
  puborectalis: ANAL_Y,
};

/** Соседние органы и крупные сосуды остаются целыми при любом разрезе — это опора для глаза. */
export const NO_CLIP = new Set(['stomach', 'pancreas', 'aorta', 'ivc']);

/* ---------- Срез стенки «под микроскопом» ---------- */

/** Сцена среза стоит со сдвигом, чтобы камера не улетала далеко. */
export const MICRO_OFFSET: V3 = [0, -2.4, 0];

const m = (at: V3, dist: number, dir: V3 = [0.12, 0.2, 0.97]): Focus => ({
  at: [at[0] + MICRO_OFFSET[0], at[1] + MICRO_OFFSET[1], at[2] + MICRO_OFFSET[2]],
  dir,
  dist,
});

export const MICRO_VIEW: Focus = m([0.5, 0.9, 0], 30, [0.12, 0.2, 0.97]);

export const MICRO_FOCUS: Record<string, Focus> = {
  serosa: m([-2, -2.6, 1.7], 6.4),
  muscularis: m([-2, -2.0, 1.7], 7.4),
  'myenteric-plexus': m([-2.6, -2.2, 1.7], 5.4),
  submucosa: m([-2.8, -1.0, 1.7], 7.2),
  'submucosal-plexus': m([-3.2, -1.0, 1.7], 5.4),
  'peyers-patches': m([-4.3, 0.0, 0.8], 6.4),
  'muscularis-mucosae': m([-1.8, -0.25, 1.7], 5.6),
  mucosa: m([0.4, 0.1, 1.7], 7.2),
  plicae: m([-1.8, 0.3, 1.7], 7.2),
  villi: m([-0.7, 1.2, 1.0], 6.2),
  crypts: m([-3.0, 0.0, 1.7], 5.2),
  'goblet-cells': m([4.8, 2.6, 0.7], 5.4),
  lacteal: m([4.8, 2.3, 0.5], 7),
  capillaries: m([4.8, 2.8, 0.5], 6.6),
  'g-micro': MICRO_VIEW,
};

export const MICRO_LABEL_AT: Record<string, V3> = {
  serosa: [-5.5, -2.62, 1.7],
  muscularis: [-5.5, -2.1, 1.7],
  'myenteric-plexus': [-4.2, -2.2, 1.78],
  submucosa: [-5.5, -1.1, 1.7],
  'submucosal-plexus': [-3.6, -1.0, 1.78],
  'peyers-patches': [-4.4, -0.2, 1.4],
  'muscularis-mucosae': [-0.2, -0.46, 1.78],
  mucosa: [1.9, 0.0, 1.7],
  plicae: [-1.8, 0.28, 1.78],
  villi: [-0.4, 1.35, 1.0],
  crypts: [-2.6, -0.05, 1.8],
  'goblet-cells': [5.5, 2.4, 0.5],
  lacteal: [4.8, 3.2, 0.2],
  capillaries: [4.2, 2.0, 0.4],
};

export const MICRO_MAIN_LABELS = new Set(['serosa', 'muscularis', 'submucosa', 'mucosa', 'villi', 'plicae', 'lacteal', 'capillaries', 'peyers-patches']);
