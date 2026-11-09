import { buildMicroData } from './micro';
import type { V3 } from './anatomy';

/** Части модели поджелудочной железы (id совпадают с пунктами «Из чего состоит») и их группы. */
export const PANC_GROUPS = {
  'g-regions': ['head', 'uncinate', 'neck', 'omental-tuber', 'body', 'tail', 'capsule'],
  'g-ducts': ['main-duct', 'side-ducts', 'accessory-duct', 'bile-duct', 'ampulla', 'sphincter-oddi', 'major-papilla', 'minor-papilla'],
  'g-vessels': [
    'celiac-trunk',
    'hepatic-artery',
    'gastroduodenal-artery',
    'pd-arcades',
    'inferior-pd-artery',
    'splenic-artery',
    'dorsal-artery',
    'great-artery',
    'sma',
    'splenic-vein',
    'imv',
    'smv',
    'portal-vein',
  ],
  'g-nerves': ['celiac-plexus', 'nerve-fibres', 'lymph-nodes'],
  'g-neighbors': [
    'duo-superior',
    'duo-descending',
    'duo-horizontal',
    'duo-ascending',
    'treitz',
    'jejunum',
    'stomach',
    'spleen',
    'left-kidney',
    'left-adrenal',
    'right-kidney',
    'aorta',
    'ivc',
    'spine',
    'liver',
    'gallbladder',
    'cystic-duct',
    'hepatic-duct',
    'mesocolon',
  ],
  'g-acinus': ['acinus', 'acinar-cell', 'zymogen', 'centroacinar', 'intercalated-duct', 'intralobular-duct', 'septum', 'acinar-capillary'],
  'g-islet': ['islet', 'alpha-cell', 'beta-cell', 'delta-cell', 'pp-cell', 'islet-capillary', 'islet-nerve'],
} as const;

export type PancGroupId = keyof typeof PANC_GROUPS;

export const PANC_PART_IDS: string[] = Object.values(PANC_GROUPS).flat();

export const GROUP_OF: Record<string, PancGroupId> = Object.fromEntries(
  (Object.entries(PANC_GROUPS) as [PancGroupId, readonly string[]][]).flatMap(([g, ids]) => ids.map((id) => [id, g])),
);

/** Части и группы, которые видны только «под микроскопом». */
export const MICRO_GROUPS: PancGroupId[] = ['g-acinus', 'g-islet'];
export const MICRO_PART_IDS = new Set<string>(MICRO_GROUPS.flatMap((g) => PANC_GROUPS[g] as readonly string[]));
export const MICRO_ONLY = new Set<string>([...MICRO_PART_IDS, ...MICRO_GROUPS]);
/** Части макромодели. */
export const MACRO_PART_IDS = PANC_PART_IDS.filter((id) => !MICRO_PART_IDS.has(id));

/** Точка, на которую смотрит камера при выборе части, направление на камеру и расстояние. */
export interface Focus {
  at: V3;
  dir: V3;
  dist: number;
}

export const OVERVIEW: Focus = { at: [0.8, 1.2, -1.2], dir: [0.14, 0.17, 0.97], dist: 66 };
/** Камера для трёх видов среза. */
export const CUT_VIEWS: Record<'side' | 'fundus' | 'coronal', Focus> = {
  side: { at: [0.9, 1.0, -1.2], dir: [0.06, 0.1, 1], dist: 50 },
  fundus: { at: [0.9, -0.2, -1.5], dir: [0.1, 1, 0.42], dist: 46 },
  coronal: { at: [-4.6, -0.8, -1.4], dir: [1, 0.16, 0.3], dist: 36 },
};
/** При разносе: дальше и сбоку, чтобы части читались по очереди. */
export const SPREAD_VIEW: Focus = { at: [0.6, 0.6, 0.0], dir: [0.34, 0.2, 0.92], dist: 96 };
export const MICRO_VIEW: Focus = { at: [-1.3, 0.0, 0], dir: [0.0, 0.05, 1], dist: 46 };

interface Info {
  at: V3;
  dist: number;
  dir?: V3;
  label?: V3;
  main?: boolean;
  inner?: boolean;
}

const D: V3 = [0.14, 0.1, 0.98];
const i = (at: V3, dist: number, o: Partial<Info> = {}): Info => ({ at, dist, ...o });

const MA = buildMicroData().anchors;
const m = (id: string, dist: number, dir: V3 = [0, 0.05, 1]): Info => i(MA[id], dist, { dir, inner: true });

const INFO: Record<string, Info> = {
  head: i([-4.6, -1.2, 1.0], 14, { main: true, label: [-5.2, -0.4, 1.6] }),
  uncinate: i([-2.3, -4.3, -2.5], 10, { dir: [0.2, 0.3, 0.93], inner: true, label: [-2.3, -4.35, -2.2] }),
  neck: i([-1.0, 0.8, 0.5], 10, { main: true, label: [-0.9, 1.5, 0.6] }),
  'omental-tuber': i([1.8, 2.3, 0.7], 8, { dir: [0.1, 0.5, 0.86] }),
  body: i([5.0, 2.1, 0.2], 14, { main: true, label: [5.2, 2.4, 0.4] }),
  tail: i([9.6, 4.3, -1.4], 11, { main: true, label: [10.0, 4.9, -1.3] }),
  capsule: i([4.5, 1.6, 0.5], 16, { label: [7.4, 1.2, 0.5] }),

  'main-duct': i([3.0, 0.9, -0.4], 14, { main: true, inner: true, label: [6.4, 1.9, -0.3] }),
  'side-ducts': i([6.6, 3.0, -0.8], 10, { inner: true }),
  'accessory-duct': i([-6.0, -0.15, -0.6], 9, { inner: true, dir: [0.1, 0.1, 1] }),
  'bile-duct': i([-5.0, -0.5, -1.8], 12, { main: true, inner: true, label: [-5.0, 0.6, -1.7] }),
  ampulla: i([-7.5, -2.75, -1.72], 6, { inner: true, dir: [-0.5, 0.1, 0.86] }),
  'sphincter-oddi': i([-7.9, -2.75, -1.72], 5.6, { inner: true, dir: [-0.55, 0.1, 0.83] }),
  'major-papilla': i([-8.3, -2.75, -1.72], 5.4, { inner: true, dir: [-0.6, 0.15, 0.8] }),
  'minor-papilla': i([-8.2, -0.4, -1.0], 5.4, { inner: true, dir: [-0.65, 0.15, 0.75] }),

  'celiac-trunk': i([1.4, 5.3, -3.3], 10, { inner: true }),
  'hepatic-artery': i([-1.4, 6.1, -2.1], 12, { inner: true }),
  'gastroduodenal-artery': i([-3.1, 3.6, -0.4], 9, { inner: true }),
  'pd-arcades': i([-7.1, -1.0, 0.4], 12, { inner: true }),
  'inferior-pd-artery': i([-2.4, -5.7, -2.6], 10, { inner: true }),
  'splenic-artery': i([6.8, 4.7, -1.7], 14, { inner: true }),
  'dorsal-artery': i([0.2, 0.4, -1.3], 9, { inner: true }),
  'great-artery': i([7.0, 2.9, -1.1], 9, { inner: true }),
  sma: i([2.0, -3.0, -2.4], 13, { main: true, inner: true, label: [2.2, -4.6, -2.0] }),
  'splenic-vein': i([5.6, 1.4, -2.4], 14, { main: true, inner: true, label: [5.6, 0.2, -2.4] }),
  imv: i([7.5, -2.0, -1.8], 11, { inner: true }),
  smv: i([-0.3, -3.0, -1.3], 12, { inner: true, label: [-0.5, -5.8, -1.2] }),
  'portal-vein': i([-3.0, 3.0, -2.3], 11, { inner: true }),

  'celiac-plexus': i([1.5, 5.0, -4.0], 9, { inner: true }),
  'nerve-fibres': i([2.4, 2.0, -3.4], 12, { inner: true }),
  'lymph-nodes': i([3.0, 3.8, -1.5], 18, { inner: true }),

  'duo-superior': i([-6.2, 4.0, 1.1], 11),
  'duo-descending': i([-9.2, -1.6, -1.7], 13, { main: true }),
  'duo-horizontal': i([-3.0, -9.4, -3.1], 16, { label: [-4.2, -9.6, -2.6] }),
  'duo-ascending': i([4.1, -5.0, -3.0], 13),
  treitz: i([3.6, -0.2, -3.0], 8, { inner: true }),
  jejunum: i([7.0, -3.9, -0.4], 11),
  stomach: i([3.0, 3.0, 4.2], 30, { main: true, label: [6.4, 6.6, 3.9] }),
  spleen: i([13.9, 5.2, -3.6], 17, { main: true, label: [14.5, 8.6, -3.2] }),
  'left-kidney': i([7.6, 0.6, -5.4], 17, { inner: true }),
  'left-adrenal': i([4.6, 5.4, -4.6], 9, { inner: true }),
  'right-kidney': i([-8.8, -1.2, -5.4], 17, { inner: true }),
  aorta: i([1.4, -3.5, -5.4], 22, { inner: true, label: [1.4, -6.6, -5.4] }),
  ivc: i([-2.7, -3.5, -5.0], 22, { inner: true, label: [-2.7, -7.2, -5.0] }),
  spine: i([0, -1.0, -8.6], 26, { inner: true, label: [0.5, 4.2, -8.4] }),
  liver: i([-8.6, 10.2, -1.2], 24, { main: true, label: [-9.5, 12.6, 0.5] }),
  gallbladder: i([-8.6, 3.0, 1.4], 13, { label: [-10.4, 2.6, 2.3] }),
  'cystic-duct': i([-6.2, 6.6, -1.0], 8, { inner: true }),
  'hepatic-duct': i([-6.1, 8.0, -1.5], 8, { inner: true }),
  mesocolon: i([3.5, -2.8, 3.2], 24, { label: [4.2, -5.6, 3.6] }),

  acinus: m('acinus', 11),
  'acinar-cell': m('acinar-cell', 9),
  zymogen: m('zymogen', 6.5),
  centroacinar: m('centroacinar', 6.5),
  'intercalated-duct': m('intercalated-duct', 8),
  'intralobular-duct': m('intralobular-duct', 9),
  septum: m('septum', 10),
  'acinar-capillary': m('acinar-capillary', 9),
  islet: m('islet', 11),
  'alpha-cell': m('alpha-cell', 5.2),
  'beta-cell': m('beta-cell', 5.2),
  'delta-cell': m('delta-cell', 5.2),
  'pp-cell': m('pp-cell', 5.2),
  'islet-capillary': m('islet-capillary', 7),
  'islet-nerve': m('islet-nerve', 7),
};

const groupFocus = (at: V3, dist: number, dir: V3 = D): Focus => ({ at, dir, dist });

export const FOCUS: Record<string, Focus> = {
  ...Object.fromEntries(Object.entries(INFO).map(([id, f]) => [id, { at: f.at, dir: f.dir ?? D, dist: f.dist }])),
  'g-regions': groupFocus([3.2, 0.9, 0.2], 24),
  'g-ducts': groupFocus([-1.5, 0.2, -0.5], 22),
  'g-vessels': groupFocus([1.5, 2.0, -2.0], 32),
  'g-nerves': groupFocus([2.5, 3.0, -3.0], 26),
  'g-neighbors': groupFocus([0.8, 0.5, -1.0], 70),
  'g-acinus': { at: [-4.2, 0.2, 0.2], dir: [0, 0.05, 1], dist: 26 },
  'g-islet': { at: [4.7, -0.2, 0], dir: [0, 0.05, 1], dist: 16 },
};

/** Якоря подписей на модели (координаты сцены). */
export const LABEL_AT: Record<string, V3> = Object.fromEntries(Object.entries(INFO).map(([id, f]) => [id, f.label ?? f.at]));

/** Какие части подписаны на модели сразу (остальные — при выборе). */
export const MAIN_LABELS = new Set(Object.entries(INFO).filter(([, f]) => f.main).map(([id]) => id));
export const MICRO_MAIN_LABELS = new Set<string>([...MICRO_PART_IDS]);

/** Подписи внутренних частей видны сквозь ткани и не прячутся при повороте. */
export const INNER_LABELS = new Set(Object.entries(INFO).filter(([, f]) => f.inner).map(([id]) => id));

/* ---------- Разнос при «Разобрать» ---------- */

const CENTER: V3 = [1.0, 0.8, -1.0];
const K: Record<string, number> = { 'g-regions': 4.2, 'g-ducts': 5.2, 'g-vessels': 6.2, 'g-nerves': 6.8, 'g-neighbors': 10 };

/** Сдвиг части при полном разносе: от центра железы, у каждой группы свой размах. */
export const SPREAD: Record<string, V3> = (() => {
  const out: Record<string, V3> = {};
  for (const id of MACRO_PART_IDS) {
    const at = INFO[id].at;
    let v: V3 = [at[0] - CENTER[0], at[1] - CENTER[1], at[2] - CENTER[2]];
    const l = Math.hypot(...v) || 1;
    const k = K[GROUP_OF[id]] ?? 6;
    v = [(v[0] / l) * k, (v[1] / l) * k, (v[2] / l) * k];
    out[id] = v;
  }
  // оболочка и протоки — вперёд, к зрителю, чтобы не прятаться внутри железы
  out.capsule = [0, 0.5, 8];
  out['main-duct'] = [0.5, -2.8, 6];
  out['side-ducts'] = [1.0, 3.0, 5.2];
  out['accessory-duct'] = [-2.5, 2.2, 5.5];
  out['bile-duct'] = [-3.8, 3.0, -2.0];
  out['omental-tuber'] = [0, 4.0, 3.5];
  return out;
})();

/** Подпись выбранного отдела видна только у самой части; для группы подсвечиваются все её части. */
export const GROUP_IDS = Object.keys(PANC_GROUPS) as PancGroupId[];
