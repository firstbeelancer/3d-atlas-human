import { ECCRINE, MEISSNER_SPOTS, PACINIAN_SPOTS, PAPILLA, RUFFINI_SPOTS, axisAt, epiBase } from './anatomy';
import type { V3 } from './geometry';

/** Части модели (id совпадают с пунктами «Из чего состоит») по группам. */
export const SKIN_GROUPS = {
  'g-layers': [
    'stratum-corneum',
    'stratum-lucidum',
    'stratum-granulosum',
    'stratum-spinosum',
    'stratum-basale',
    'papillary-dermis',
    'reticular-dermis',
    'hypodermis',
    'fat-lobules',
    'collagen',
    'elastin',
  ],
  'g-cells': ['keratinocytes', 'melanocytes', 'melanosomes', 'langerhans', 'merkel-cells'],
  'g-appendages': [
    'hair-shaft',
    'hair-root',
    'hair-bulb',
    'hair-papilla',
    'sebaceous-gland',
    'arrector-pili',
    'eccrine-gland',
    'eccrine-duct',
    'sweat-pore',
    'apocrine-gland',
  ],
  'g-vessels': ['deep-plexus', 'dermal-plexus', 'subpapillary-plexus', 'capillary-loops', 'lymph-capillaries'],
  'g-nerves': ['nerve-plexus', 'meissner', 'pacinian', 'ruffini', 'free-endings'],
  'g-surface': ['skin-microrelief', 'desquamation'],
} as const;

export type SkinGroupId = keyof typeof SKIN_GROUPS;

export const SKIN_PART_IDS: string[] = Object.values(SKIN_GROUPS).flat();

export const GROUP_OF: Record<string, SkinGroupId> = Object.fromEntries(
  (Object.entries(SKIN_GROUPS) as [SkinGroupId, readonly string[]][]).flatMap(([g, ids]) => ids.map((id) => [id, g])),
);

/** Части, которые поворачиваются вместе с волосом, когда мышца сокращается («мурашки»). */
export const ROCKING = new Set<string>(['hair-shaft', 'hair-root', 'hair-bulb', 'hair-papilla', 'sebaceous-gland']);

/** Оболочка из «мягких» тканей: становится почти прозрачной при просвечивании. */
export const XRAY_SHELL = new Set<string>([
  'skin-microrelief',
  'stratum-corneum',
  'stratum-lucidum',
  'stratum-granulosum',
  'stratum-spinosum',
  'stratum-basale',
  'papillary-dermis',
  'reticular-dermis',
  'hypodermis',
  'fat-lobules',
  'collagen',
  'elastin',
]);

export interface Focus {
  at: V3;
  dir: V3;
  dist: number;
}

const norm = (v: V3): V3 => {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

const FRONT: V3 = norm([0.16, 0.12, 1]);

export const OVERVIEW: Focus = { at: [0.6, -3.4, 0], dir: FRONT, dist: 46 };

/** Виды для трёх разрезов: камера со стороны убранной части. */
export const CUT_VIEWS: Record<'side' | 'fundus' | 'coronal', Focus> = {
  side: { at: [0.6, -3.4, 0], dir: FRONT, dist: 44 },
  fundus: { at: [0, -4.2, 0], dir: norm([1, 0.14, 0.22]), dist: 30 },
  coronal: { at: [0, -4.6, 0], dir: norm([0.08, 1, 0.32]), dist: 30 },
};

export const SPREAD_VIEW: Focus = { at: [0.5, -3.8, 0], dir: norm([0.2, 0.18, 1]), dist: 54 };

interface Info {
  at: V3;
  dist: number;
  dir?: V3;
  main?: boolean;
}

const ax = (u: number, dx = 0, z = 0.25): V3 => {
  const p = axisAt(u);
  return [p[0] + dx, p[1], z];
};
const f = (at: V3, dist: number, o: Partial<Info> = {}): Info => ({ at, dist, ...o });
const spot = (s: [number, number], dy: number): V3 => [s[0], epiBase(s[0], s[1]) + dy, s[1]];

const INFO: Record<string, Info> = {
  // слои
  'stratum-corneum': f([-8.2, -0.1, 0.3], 9, { main: true }),
  'stratum-lucidum': f([-7.2, -0.24, 0.3], 7),
  'stratum-granulosum': f([-6.2, -0.36, 0.3], 7),
  'stratum-spinosum': f([-5.0, -0.62, 0.3], 8),
  'stratum-basale': f([-3.8, -0.95, 0.3], 7, { main: true }),
  'papillary-dermis': f([-8.0, -1.6, 0.3], 10, { main: true }),
  'reticular-dermis': f([-8.0, -4.2, 0.3], 12, { main: true }),
  hypodermis: f([-8.0, -8.4, 0.3], 13, { main: true }),
  'fat-lobules': f([-3.4, -8.6, 0.3], 9),
  collagen: f([-5.6, -3.4, 0.3], 9),
  elastin: f([-4.4, -4.8, 0.3], 8),
  // клетки
  keratinocytes: f([-6.4, -0.66, 0.2], 5, { main: true }),
  melanocytes: f([-5.5, epiBase(-5.5, -0.2) + 0.05, 0.2], 4.5, { main: true }),
  melanosomes: f([-2.2, -0.62, 0.2], 4),
  langerhans: f([-0.5, -0.6, 0.2], 4.5),
  'merkel-cells': f(spot([-3.2, 1.0], -0.05), 4.5),
  // придатки
  'hair-shaft': f([7.1, 3.95, 0.2], 8, { main: true }),
  'hair-root': f(ax(0.5, 0.0), 6, { main: true }),
  'hair-bulb': f(ax(0.93, 1.0), 5),
  'hair-papilla': f([PAPILLA.c[0], PAPILLA.c[1] - 0.2, 0.25], 3.6),
  'sebaceous-gland': f([1.5, -1.95, 0.3], 6, { main: true }),
  'arrector-pili': f([-0.3, -2.5, 0.3], 7, { main: true }),
  'eccrine-gland': f([ECCRINE[0].c[0], ECCRINE[0].c[1], 0.4], 7, { main: true }),
  'eccrine-duct': f([-5.2, -3.6, 0.4], 6),
  'sweat-pore': f([-5.2, 0.05, 0.45], 4),
  'apocrine-gland': f([7.5, -6.8, -1.6], 7),
  // сосуды и лимфа
  'deep-plexus': f([-4.5, -6.7, 0.3], 9, { main: true }),
  'dermal-plexus': f([3.5, -3.8, 0.3], 8),
  'subpapillary-plexus': f([-6.2, -2.15, 0.3], 8),
  'capillary-loops': f([-2.5, -1.5, 0.3], 6, { main: true }),
  'lymph-capillaries': f([2.2, -1.7, 0.3], 6),
  // нервы и рецепторы
  'nerve-plexus': f([2.0, -5.6, 0.3], 8, { main: true }),
  meissner: f([MEISSNER_SPOTS[0][0], epiBase(MEISSNER_SPOTS[0][0], MEISSNER_SPOTS[0][1]) + 0.4, MEISSNER_SPOTS[0][1]], 5, { main: true }),
  pacinian: f([PACINIAN_SPOTS[0][0], PACINIAN_SPOTS[0][1], PACINIAN_SPOTS[0][2]], 6, { main: true }),
  ruffini: f([RUFFINI_SPOTS[0][0], RUFFINI_SPOTS[0][1], RUFFINI_SPOTS[0][2]], 6),
  'free-endings': f([-7.0, -1.1, 0.3], 5),
  // поверхность
  'skin-microrelief': f([-2.0, 0.05, 2.6], 9, { main: true }),
  desquamation: f([2.6, 0.25, 3.2], 6),
};

export const MAIN_LABELS = new Set<string>(Object.entries(INFO).filter(([, i]) => i.main).map(([id]) => id));
export const INNER_LABELS = new Set<string>(SKIN_PART_IDS);

/** Точка подписи части. */
export const LABEL_AT: Record<string, V3> = Object.fromEntries(Object.entries(INFO).map(([id, i]) => [id, i.at]));

const groupAt: Record<SkinGroupId, V3> = {
  'g-layers': [-2, -4.5, 0],
  'g-cells': [-3, -0.7, 0],
  'g-appendages': [2.5, -3.5, 0],
  'g-vessels': [-1, -4.5, 0],
  'g-nerves': [1, -5.5, 0],
  'g-surface': [0, 0.2, 2],
};
const groupDist: Record<SkinGroupId, number> = {
  'g-layers': 26,
  'g-cells': 14,
  'g-appendages': 22,
  'g-vessels': 22,
  'g-nerves': 20,
  'g-surface': 16,
};

/** Куда летит камера для каждой части и группы. */
export const FOCUS: Record<string, Focus> = {};
for (const id of SKIN_PART_IDS) {
  const i = INFO[id];
  FOCUS[id] = { at: [i.at[0], i.at[1], 0], dir: i.dir ?? FRONT, dist: i.dist };
}
for (const g of Object.keys(SKIN_GROUPS) as SkinGroupId[]) {
  FOCUS[g] = { at: groupAt[g], dir: FRONT, dist: groupDist[g] };
}

/** Разнос на части: кожа расходится слоями по вертикали, остальное — от центра блока. */
const CENTER: V3 = [0.5, -4.5, 0];
const LAYER_STACK: Record<string, number> = {
  'skin-microrelief': 6.8,
  desquamation: 7.8,
  'stratum-corneum': 5.9,
  'stratum-lucidum': 5.1,
  'stratum-granulosum': 4.4,
  'stratum-spinosum': 3.7,
  'stratum-basale': 3.0,
  'papillary-dermis': 1.7,
  'reticular-dermis': -0.9,
  hypodermis: -4.4,
  'fat-lobules': -6.4,
  collagen: -2.5,
  elastin: -3.3,
  keratinocytes: 3.7,
  melanocytes: 3.0,
  melanosomes: 3.7,
  langerhans: 3.7,
  'merkel-cells': 3.0,
};
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const SPREAD: Record<string, V3> = {};
for (const id of SKIN_PART_IDS) {
  if (id in LAYER_STACK) {
    const dz = GROUP_OF[id] === 'g-cells' ? 1.6 : id === 'skin-microrelief' || id === 'desquamation' ? 0.6 : 0.8;
    SPREAD[id] = [0, LAYER_STACK[id], dz];
    continue;
  }
  const d = sub(INFO[id].at, CENTER);
  const k = 0.5;
  SPREAD[id] = [d[0] * k * 0.55, d[1] * k * 0.55, 2.8 + (GROUP_OF[id] === 'g-vessels' || GROUP_OF[id] === 'g-nerves' ? 1.4 : 0)];
}
