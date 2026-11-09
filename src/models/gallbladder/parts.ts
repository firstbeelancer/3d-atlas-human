import { AXIAL_S, axialNormalUnit, gbAxis, type V3 } from './anatomy';

/** Части модели желчного пузыря (id совпадают с пунктами «Из чего состоит») и их группы. */
export const GB_GROUPS = {
  'g-shape': ['fundus', 'body', 'infundibulum', 'neck'],
  'g-wall': ['serosa', 'subserosa', 'muscularis', 'propria', 'mucosa', 'rugae', 'rokitansky'],
  'g-inside': ['bile', 'spiral-valve'],
  'g-ducts': [
    'right-hepatic-duct',
    'left-hepatic-duct',
    'common-hepatic-duct',
    'cystic-duct',
    'common-bile-duct',
    'pancreatic-duct',
    'ampulla',
    'sphincter-oddi',
    'papilla',
  ],
  'g-supply': ['cystic-artery', 'hepatic-artery', 'portal-vein', 'cystic-vein', 'nerves', 'lymph-nodes'],
  'g-neighbors': ['liver', 'gb-fossa', 'ligament', 'calot-triangle', 'duodenum', 'pancreas'],
} as const;

export type GbGroupId = keyof typeof GB_GROUPS;

export const GB_PART_IDS: string[] = Object.values(GB_GROUPS).flat();

export const GROUP_OF: Record<string, GbGroupId> = Object.fromEntries(
  (Object.entries(GB_GROUPS) as [GbGroupId, readonly string[]][]).flatMap(([g, ids]) => ids.map((id) => [id, g])),
);

/** Части самого пузыря: сжимаются при сокращении, обрезаются плоскостями разреза. */
export const ORGAN_PARTS = new Set<string>([
  ...GB_GROUPS['g-shape'],
  ...GB_GROUPS['g-wall'],
  ...GB_GROUPS['g-inside'],
  // сосуды и нервы лежат на самой стенке: режутся и сжимаются вместе с ней
  'cystic-artery',
  'cystic-vein',
  'nerves',
]);

/** Всё, что не режется плоскостями разреза (протоки, сосуды и соседи видны целиком). */
export const NO_CLIP = new Set<string>(GB_PART_IDS.filter((id) => !ORGAN_PARTS.has(id)));

/** Точка, на которую смотрит камера при выборе части, направление на камеру и расстояние. */
export interface Focus {
  at: V3;
  dir: V3;
  dist: number;
}

export const OVERVIEW: Focus = { at: [1.9, 0.2, -0.6], dir: [0.12, 0.1, 0.99], dist: 39 };
/** Фронтальный разрез: смотрим прямо в раскрытую полость пузыря. */
export const CUT_VIEW: Focus = { at: [-1.5, -0.2, 0.3], dir: [0.1, 0.12, 0.99], dist: 17 };
/** Поперечный разрез: сверху вдоль оси на кольцо стенки. */
export const AXIAL_VIEW: Focus = { at: gbAxis(AXIAL_S), dir: axialNormalUnit(), dist: 7.6 };
/** При разносе на части: чуть дальше и сбоку, чтобы слои читались по очереди. */
export const SPREAD_VIEW: Focus = { at: [1.0, 0.4, -0.5], dir: [0.34, 0.16, 0.93], dist: 46 };

const D: V3 = [0.2, 0.12, 0.97];
const f = (at: V3, dist: number, dir: V3 = D): Focus => ({ at, dir, dist });

export const FOCUS: Record<string, Focus> = {
  fundus: f([-2.7, -2.9, 1.4], 6.2, [-0.15, 0.1, 0.98]),
  body: f([-1.9, -0.7, 0.7], 7.2),
  infundibulum: f([-0.6, 1.65, -0.1], 5.6, [0.3, 0.14, 0.94]),
  neck: f([0.3, 2.35, -0.55], 5.2, [0.2, 0.4, 0.9]),
  serosa: f([-2.1, -1.0, 1.1], 8.2),
  subserosa: f([-1.9, -0.8, 0.7], 7.4, [0.1, 0.12, 0.99]),
  muscularis: f([-1.9, -0.7, 0.5], 6.6, [0.1, 0.12, 0.99]),
  propria: f([-1.9, -0.7, 0.4], 6.4, [0.1, 0.12, 0.99]),
  mucosa: f([-1.9, -0.7, 0.4], 6.4, [0.1, 0.12, 0.99]),
  rugae: f([-1.9, -0.6, 0.3], 5.4, [0.08, 0.1, 0.99]),
  rokitansky: f([-2.0, -0.8, 0.3], 4.8, [0.08, 0.1, 0.99]),
  bile: f([-1.9, -0.8, 0.4], 7.2, [0.1, 0.12, 0.99]),
  'spiral-valve': f([1.15, 2.1, -0.95], 4.6, [0.2, 0.3, 0.93]),
  'right-hepatic-duct': f([0.2, 4.35, -1.9], 7.5, [0.1, 0.1, 0.99]),
  'left-hepatic-duct': f([4.6, 4.45, -2.0], 7.5, [0.1, 0.1, 0.99]),
  'common-hepatic-duct': f([2.5, 2.8, -1.8], 6.4, [0.2, 0.1, 0.97]),
  'cystic-duct': f([1.5, 2.0, -1.25], 5.2, [0.2, 0.2, 0.96]),
  'common-bile-duct': f([2.8, -1.4, -2.0], 8.4, [0.15, 0.1, 0.98]),
  'pancreatic-duct': f([5.0, -3.8, -2.1], 8.2, [0.1, 0.1, 0.99]),
  ampulla: f([2.66, -4.5, -1.78], 5.6, [-0.35, 0.1, 0.93]),
  'sphincter-oddi': f([2.66, -4.4, -1.78], 5.6, [-0.35, 0.1, 0.93]),
  papilla: f([2.4, -4.55, -1.74], 5.2, [-0.6, 0.12, 0.8]),
  'cystic-artery': f([0.5, 2.1, -0.8], 5.6, [0.25, 0.2, 0.95]),
  'hepatic-artery': f([3.8, 1.0, -2.3], 9.2, [0.1, 0.1, 0.99]),
  'portal-vein': f([3.4, 1.4, -2.5], 9.2, [0.1, 0.1, 0.99]),
  'cystic-vein': f([1.4, 1.9, -1.4], 6.4, [0.25, 0.2, 0.95]),
  nerves: f([2.4, 2.1, -1.6], 8, [0.2, 0.15, 0.97]),
  'lymph-nodes': f([2.4, 1.3, -1.9], 8.8, [0.2, 0.15, 0.97]),
  liver: f([0.2, 3.6, -2.4], 15, [0.15, -0.25, 0.96]),
  'gb-fossa': f([-1.0, 1.3, -0.4], 7.2, [-0.1, 0.1, 0.99]),
  ligament: f([3.3, 1.8, -1.45], 9.4),
  'calot-triangle': f([1.6, 2.25, -1.3], 5.2, [0.15, 0.1, 0.98]),
  duodenum: f([2.8, -3.8, -1.5], 12, [0.1, 0.1, 0.99]),
  pancreas: f([5.4, -4.0, -2.2], 12.5, [0.1, 0.1, 0.99]),
  'g-shape': OVERVIEW,
  'g-wall': f([-1.9, -0.7, 0.5], 9, [0.2, 0.15, 0.97]),
  'g-inside': f([-1.0, 0.6, 0.2], 9, [0.12, 0.12, 0.99]),
  'g-ducts': f([2.4, 0.2, -1.8], 17, [0.1, 0.1, 0.99]),
  'g-supply': f([2.4, 0.9, -1.8], 17, [0.1, 0.1, 0.99]),
  'g-neighbors': f([2.2, -0.2, -1.5], 24, [0.1, 0.1, 0.99]),
};

/** Разнос при «Разобрать»: сдвиг части и радиальное расширение слоя (от центра пузыря). */
export interface Spread {
  d?: V3;
  k?: number;
}

export const SPREAD: Record<string, Spread> = {
  fundus: { k: 0.4 },
  body: { k: 0.4 },
  infundibulum: { k: 0.4 },
  neck: { k: 0.4 },
  serosa: { k: 0.52 },
  subserosa: { k: 0.3 },
  muscularis: { k: 0.2 },
  propria: { k: 0.11 },
  mucosa: { k: 0.03 },
  rugae: { k: -0.05 },
  rokitansky: { k: 0.16 },
  bile: { k: -0.18 },
  'spiral-valve': { d: [1.0, 1.1, 1.3] },
  'right-hepatic-duct': { d: [-1.2, 1.5, 0.4] },
  'left-hepatic-duct': { d: [1.6, 1.6, 0.4] },
  'common-hepatic-duct': { d: [1.7, 1.0, 0.6] },
  'cystic-duct': { d: [1.0, 0.9, 1.0] },
  'common-bile-duct': { d: [1.9, -0.5, 0.7] },
  'pancreatic-duct': { d: [1.8, -1.0, 0.9] },
  ampulla: { d: [1.5, -1.4, 1.1] },
  'sphincter-oddi': { d: [1.5, -1.8, 1.3] },
  papilla: { d: [-0.2, -1.4, 1.2] },
  'cystic-artery': { d: [0.6, 0.8, 1.5] },
  'hepatic-artery': { d: [2.4, 0.4, 0.8] },
  'portal-vein': { d: [2.0, 0.2, -0.6] },
  'cystic-vein': { d: [0.3, 0.2, -1.5] },
  nerves: { d: [2.6, -0.4, 0.9] },
  'lymph-nodes': { d: [2.0, 0.4, 0.4] },
  liver: { d: [-1.4, 2.6, -1.8] },
  'gb-fossa': { d: [-1.4, 2.6, -1.4] },
  ligament: { d: [2.2, 0.8, -1.2] },
  'calot-triangle': { d: [1.2, 1.8, 0.6] },
  duodenum: { d: [-1.2, -2.0, 0.3] },
  pancreas: { d: [2.8, -1.6, -0.9] },
};

/** Якоря подписей на модели (координаты сцены). */
export const LABEL_AT: Record<string, V3> = {
  fundus: [-3.25, -3.3, 1.7],
  body: [-3.1, -0.9, 1.15],
  infundibulum: [-0.2, 1.1, 0.2],
  neck: [0.15, 2.95, -0.2],
  serosa: [-2.7, -2.0, 1.45],
  subserosa: [-2.4, 0.4, 0.95],
  muscularis: [-2.2, -0.2, 0.7],
  propria: [-1.5, -1.5, 1.0],
  mucosa: [-1.3, -0.4, 0.55],
  rugae: [-2.0, -1.0, 0.2],
  rokitansky: [-2.45, -0.8, 0.5],
  bile: [-1.9, -0.2, 0.3],
  'spiral-valve': [1.1, 2.1, -0.95],
  'right-hepatic-duct': [0.2, 4.4, -1.9],
  'left-hepatic-duct': [4.6, 4.4, -2.0],
  'common-hepatic-duct': [2.5, 2.9, -1.8],
  'cystic-duct': [1.6, 1.9, -1.35],
  'common-bile-duct': [2.8, -1.6, -2.05],
  'pancreatic-duct': [5.0, -3.9, -2.15],
  ampulla: [2.7, -4.5, -1.78],
  'sphincter-oddi': [2.7, -4.3, -1.7],
  papilla: [2.4, -4.6, -1.74],
  'cystic-artery': [0.55, 2.2, -0.8],
  'hepatic-artery': [4.0, 1.4, -2.3],
  'portal-vein': [3.5, 0.2, -2.55],
  'cystic-vein': [1.4, 1.8, -1.6],
  nerves: [2.2, 2.3, -1.75],
  'lymph-nodes': [3.1, 0.6, -2.3],
  liver: [-4.6, 4.9, -2.0],
  'gb-fossa': [-1.1, 1.0, -0.5],
  ligament: [4.5, 2.5, -1.45],
  'calot-triangle': [1.5, 2.45, -1.3],
  duodenum: [0.6, -5.3, -1.0],
  pancreas: [6.8, -5.0, -2.3],
};

/** Какие части подписаны на модели сразу (остальные — при выборе). */
export const MAIN_LABELS = new Set([
  'fundus',
  'body',
  'neck',
  'cystic-duct',
  'common-hepatic-duct',
  'common-bile-duct',
  'liver',
  'duodenum',
]);

/** Подписи внутренних частей видны сквозь стенки и не прячутся при повороте. */
export const INNER_LABELS = new Set([
  'subserosa',
  'muscularis',
  'propria',
  'mucosa',
  'rugae',
  'rokitansky',
  'bile',
  'spiral-valve',
  'ampulla',
  'sphincter-oddi',
  'papilla',
  'pancreatic-duct',
  'common-bile-duct',
  'portal-vein',
  'hepatic-artery',
  'lymph-nodes',
  'gb-fossa',
]);
