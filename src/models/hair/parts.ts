import { AX, HAIR_UP, PAPILLA, axisAt, type SceneId } from './anatomy';
import type { V3 } from './geometry';

/** Части модели (id совпадают с пунктами «Из чего состоит») по группам. */
export const HAIR_GROUPS = {
  'g-hair': ['hair-shaft', 'hair-tip', 'hair-root', 'hair-cuticle', 'hair-cortex', 'hair-medulla', 'melanin'],
  'g-sheaths': [
    'irs-cuticle',
    'huxley',
    'henle',
    'companion',
    'ors',
    'glassy',
    'connective-sheath',
    'infundibulum',
    'isthmus',
    'bulge',
    'hair-bulb',
    'matrix',
    'papilla',
    'bulb-melanocytes',
  ],
  'g-skin': ['stratum-corneum', 'epidermis', 'basal-layer', 'papillary-dermis', 'reticular-dermis', 'hypodermis', 'fat-lobules', 'collagen'],
  'g-glands': ['sebaceous-gland', 'sebaceous-duct', 'sebum', 'arrector-pili', 'arrector-attachment', 'apocrine-gland', 'apocrine-duct'],
  'g-vessels': ['follicular-artery', 'follicular-vein', 'papilla-capillaries', 'perifollicular-plexus', 'subpapillary-plexus', 'nerve-plexus', 'lanceolate-endings', 'merkel-discs'],
  'g-fibre': ['s-cuticle-scales', 's-cuticle-layers', 's-cmc', 's-cortical-cells', 's-macrofibril', 's-microfibril', 's-medulla', 's-air', 's-melanosomes'],
  'g-types': ['t-round', 't-oval', 't-flat'],
  'g-cycle': ['anagen', 'catagen', 'telogen', 'club-hair', 'epithelial-strand', 'secondary-germ', 'resting-papilla', 'shedding-hair'],
  'g-plate': ['nail-dorsal', 'nail-root', 'lunula', 'nail-body', 'free-edge', 'nail-ventral', 'onychodermal-band', 'nail-ridges'],
  'g-folds': ['proximal-fold', 'eponychium', 'nail-cuticle', 'lateral-folds', 'hyponychium'],
  'g-matrix': ['germinal-matrix', 'sterile-matrix', 'bed-ridges', 'matrix-melanocytes', 'nail-bed-dermis'],
  'g-finger': [
    'distal-phalanx',
    'phalanx-tuft',
    'middle-phalanx-head',
    'joint-cartilage',
    'collateral-ligament',
    'extensor-tendon',
    'flexor-tendon',
    'finger-pulp',
    'fat-septa',
    'finger-skin',
    'fingerprint',
    'eccrine-glands',
    'pacinian',
    'meissner',
  ],
  'g-nailvessels': ['digital-artery', 'digital-vein', 'digital-nerve', 'nail-arcade', 'nail-capillaries', 'glomus'],
} as const;

export type HairGroupId = keyof typeof HAIR_GROUPS;

export const HAIR_PART_IDS: string[] = Object.values(HAIR_GROUPS).flat();

export const GROUP_OF: Record<string, HairGroupId> = Object.fromEntries(
  (Object.entries(HAIR_GROUPS) as [HairGroupId, readonly string[]][]).flatMap(([g, ids]) => ids.map((id) => [id, g])),
);

export const SCENE_OF_GROUP: Record<HairGroupId, SceneId> = {
  'g-hair': 'follicle',
  'g-sheaths': 'follicle',
  'g-skin': 'follicle',
  'g-glands': 'follicle',
  'g-vessels': 'follicle',
  'g-fibre': 'shaft',
  'g-types': 'shaft',
  'g-cycle': 'cycle',
  'g-plate': 'nail',
  'g-folds': 'nail',
  'g-matrix': 'nail',
  'g-finger': 'nail',
  'g-nailvessels': 'nail',
};

/** Сцена, в которой живёт часть или группа. */
export const sceneOf = (id: string): SceneId | null => {
  if (id in SCENE_OF_GROUP) return SCENE_OF_GROUP[id as HairGroupId];
  const g = GROUP_OF[id];
  return g ? SCENE_OF_GROUP[g] : null;
};

export const SCENE_PARTS: Record<SceneId, string[]> = {
  follicle: HAIR_PART_IDS.filter((id) => sceneOf(id) === 'follicle'),
  shaft: HAIR_PART_IDS.filter((id) => sceneOf(id) === 'shaft'),
  cycle: HAIR_PART_IDS.filter((id) => sceneOf(id) === 'cycle'),
  nail: HAIR_PART_IDS.filter((id) => sceneOf(id) === 'nail'),
};

/** Части, которые поворачиваются вместе с волосом, когда мышца сокращается («мурашки»). */
export const ROCKING = new Set<string>([
  ...HAIR_GROUPS['g-hair'],
  'irs-cuticle',
  'huxley',
  'henle',
  'companion',
  'ors',
  'glassy',
  'connective-sheath',
  'infundibulum',
  'isthmus',
  'bulge',
  'hair-bulb',
  'matrix',
  'papilla',
  'bulb-melanocytes',
  'sebaceous-gland',
  'sebaceous-duct',
  'sebum',
  'follicular-artery',
  'follicular-vein',
  'papilla-capillaries',
  'perifollicular-plexus',
  'nerve-plexus',
  'lanceolate-endings',
]);

/** Оболочка из «мягких» тканей: становится почти прозрачной при просвечивании. */
export const XRAY_SHELL = new Set<string>([
  'stratum-corneum',
  'epidermis',
  'basal-layer',
  'papillary-dermis',
  'reticular-dermis',
  'hypodermis',
  'finger-skin',
  'finger-pulp',
  'proximal-fold',
  'lateral-folds',
  'nail-bed-dermis',
  'connective-sheath',
  'ors',
  'glassy',
  'hair-bulb',
  'ctx-skin',
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
/** Поворот сцены «ноготь» на 90° вокруг z: палец смотрит вверх. */
export const NAIL_ROT = Math.PI / 2;
export const nailWorld = (p: V3): V3 => [-p[1], p[0], p[2]];

const FRONT: V3 = norm([0.14, 0.1, 1]);
const dirOf = (scene: SceneId, d: V3 = FRONT): V3 => (scene === 'nail' ? norm(nailWorld(d)) : d);

export const OVERVIEW: Record<SceneId, Focus> = {
  follicle: { at: [2.2, -2.6, 0], dir: FRONT, dist: 60 },
  shaft: { at: [3.0, -1.6, 0], dir: norm([0.1, 0.08, 1]), dist: 52 },
  cycle: { at: [0, -3.4, 0], dir: FRONT, dist: 52 },
  nail: { at: nailWorld([6, 0.4, 0]), dir: dirOf('nail'), dist: 92 },
};

const up: V3 = [0, 1, 0];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** Виды для трёх разрезов: камера со стороны убранной части. */
export const CUT_VIEWS: Record<SceneId, Record<'side' | 'fundus' | 'coronal', Focus>> = {
  follicle: {
    side: { at: [2.2, -2.6, 0], dir: FRONT, dist: 60 },
    fundus: { at: [2.8, -3.4, 0], dir: norm([0.48, 0.86, 0.3]), dist: 25 },
    coronal: { at: [2.4, -4.4, 0], dir: norm([0.08, 1, 0.34]), dist: 27 },
  },
  shaft: {
    side: { at: [3.0, -1.6, 0], dir: norm([0.1, 0.08, 1]), dist: 52 },
    fundus: { at: [0, -0.8, 0], dir: norm([1, 0.14, 0.18]), dist: 26 },
    coronal: { at: [3.6, -1.6, 0], dir: norm([0.06, 1, 0.3]), dist: 38 },
  },
  cycle: {
    side: { at: [0, -3.4, 0], dir: FRONT, dist: 52 },
    fundus: { at: [0, -3.4, 0], dir: norm([1, 0.14, 0.28]), dist: 28 },
    coronal: { at: [0, -4.4, 0], dir: norm([0.06, 1, 0.34]), dist: 30 },
  },
  nail: {
    side: { at: nailWorld([6, 0.4, 0]), dir: dirOf('nail'), dist: 92 },
    fundus: { at: nailWorld([5, 0, 0]), dir: norm(nailWorld([1, 0.18, 0.22])), dist: 30 },
    coronal: { at: nailWorld([9.6, 0, 0]), dir: norm(nailWorld([0.12, 1, 0.3])), dist: 52 },
  },
};

export const SPREAD_VIEW: Record<SceneId, Focus> = {
  follicle: { at: [1.5, -3.2, 0], dir: norm([0.2, 0.18, 1]), dist: 52 },
  shaft: { at: [3.6, -1.6, 0], dir: norm([0.12, 0.1, 1]), dist: 56 },
  cycle: { at: [0, -3.4, 0], dir: norm([0.2, 0.18, 1]), dist: 50 },
  nail: { at: nailWorld([9.6, 0.4, 0]), dir: dirOf('nail', norm([0.2, 0.2, 1])), dist: 86 },
};

interface Info {
  at: V3;
  dist: number;
  dir?: V3;
  main?: boolean;
}

const hu = (t: number, dx = 0, dy = 0, z = 0.25): V3 => {
  const p = HAIR_UP.getPoint(t);
  return [p.x + dx, p.y + dy, z];
};
const ax = (u: number, dx = 0, z = 0.25): V3 => {
  const p = axisAt(u);
  return [p[0] + dx, p[1], z];
};
const f = (at: V3, dist: number, o: Partial<Info> = {}): Info => ({ at, dist, ...o });

const INFO: Record<string, Info> = {
  // волос
  'hair-shaft': f(hu(0.3), 6, { main: true }),
  'hair-tip': f(hu(0.97), 5),
  'hair-root': f(ax(0.52, 0.0), 6, { main: true }),
  'hair-cuticle': f(ax(0.6, 0.265), 3.2),
  'hair-cortex': f(ax(0.68, -0.15), 3.2),
  'hair-medulla': f(ax(0.8, 0.0), 2.6),
  melanin: f(ax(0.72, 0.12), 2.6),
  // фолликул и луковица
  'irs-cuticle': f(ax(0.5, -0.31), 3.2),
  huxley: f(ax(0.55, -0.37), 3.2),
  henle: f(ax(0.6, -0.45), 3.2),
  companion: f(ax(0.66, -0.5), 3.2),
  ors: f(ax(0.72, -0.7), 3.6),
  glassy: f(ax(0.77, -0.86), 3.6),
  'connective-sheath': f(ax(0.4, 1.0), 4.4, { main: true }),
  infundibulum: f(ax(0.07, 0.72), 4.6, { main: true }),
  isthmus: f(ax(0.24, 0.7), 4.6),
  bulge: f(ax(0.395, -0.82), 4.6, { main: true }),
  'hair-bulb': f(ax(0.93, 1.1), 5, { main: true }),
  matrix: f(ax(0.945, -0.55), 3.4),
  papilla: f([PAPILLA.c[0], PAPILLA.c[1] - 0.2, 0.25], 3.6, { main: true }),
  'bulb-melanocytes': f(ax(0.9, 0.62), 3.2),
  // кожа
  'stratum-corneum': f([-7.4, -0.08, 0.3], 9),
  epidermis: f([-6.4, -0.4, 0.3], 8),
  'basal-layer': f([-5.0, -0.68, 0.3], 7),
  'papillary-dermis': f([-7.4, -1.25, 0.3], 10),
  'reticular-dermis': f([-7.4, -3.6, 0.3], 12, { main: true }),
  hypodermis: f([-7.4, -7.4, 0.3], 13, { main: true }),
  'fat-lobules': f([-3.6, -8.0, 0.3], 9),
  collagen: f([-5.4, -3.0, 0.3], 9),
  // железы и мышца
  'sebaceous-gland': f([1.15, -1.55, 0.3], 6, { main: true }),
  'sebaceous-duct': f([2.9, -1.1, 0.3], 4.5),
  sebum: f([1.5, -1.2, 0.3], 4.2),
  'arrector-pili': f([-0.5, -2.05, 0.3], 7, { main: true }),
  'arrector-attachment': f([-3.1, -1.05, 0.3], 4.5),
  'apocrine-gland': f([7.6, -6.1, 0.3], 7),
  'apocrine-duct': f([5.9, -3.3, 0.3], 6),
  // сосуды и нервы
  'follicular-artery': f([-2.8, -8.05, -0.4], 8, { main: true }),
  'follicular-vein': f([5.0, -8.1, -0.4], 8),
  'papilla-capillaries': f([PAPILLA.c[0], PAPILLA.c[1] + 0.1, 0.1], 3),
  'perifollicular-plexus': f(ax(0.58, 1.12), 5),
  'subpapillary-plexus': f([-6.0, -1.85, 0.3], 8),
  'nerve-plexus': f([4.0, -3.8, 0.3], 6, { main: true }),
  'lanceolate-endings': f(ax(0.4, 0.95), 3.4),
  'merkel-discs': f([5.9, -0.6, 0.3], 4.5),
  // волос под микроскопом
  's-cuticle-scales': f([-3.4, 1.6, 1.8], 12, { main: true }),
  's-cuticle-layers': f([-7.0, 1.95, 0.1], 7),
  's-cmc': f([4.8, 1.55, 0.5], 8),
  's-cortical-cells': f([6.2, 0.9, 1.3], 8, { main: true }),
  's-macrofibril': f([11.2, 0.6, 1.0], 8, { main: true }),
  's-microfibril': f([13.8, 0.2, 0.7], 6, { main: true }),
  's-medulla': f([-7.0, -0.1, 0.1], 6, { main: true }),
  's-air': f([1.4, 0.1, 0.1], 5),
  's-melanosomes': f([7.2, -0.7, 1.1], 7),
  't-round': f([-4.6, -5.8, 0.4], 7, { main: true }),
  't-oval': f([0.4, -5.8, 0.4], 7, { main: true }),
  't-flat': f([5.6, -5.8, 0.4], 7, { main: true }),
  // цикл роста
  anagen: f([-6.2, -3.6, 0.3], 14, { main: true }),
  catagen: f([0, -2.2, 0.3], 14, { main: true }),
  telogen: f([6.2, -1.1, 0.3], 14, { main: true }),
  'club-hair': f([6.2, -1.95, 0.3], 7),
  'epithelial-strand': f([0, -5.3, 0.3], 8),
  'secondary-germ': f([6.2, -3.0, 0.3], 6),
  'resting-papilla': f([6.2, -4.55, 0.3], 6),
  'shedding-hair': f([9.1, 0.5, 0.6], 8),
};

/** Ногтевая сцена: положения в мм пальца до поворота. */
const nailInfo: Record<string, Info> = {
  'nail-dorsal': f([15, 4.4, 0.2], 20, { main: true }),
  'nail-root': f([3.4, 3.7, 0.2], 9),
  lunula: f([7.6, 4.15, 0.2], 9, { main: true }),
  'nail-body': f([14, 4.2, 0.2], 14),
  'free-edge': f([24.6, 3.5, 0.2], 10, { main: true }),
  'nail-ventral': f([17, 3.45, 0.2], 10),
  'onychodermal-band': f([21.0, 4.05, 0.2], 10),
  'nail-ridges': f([11, 4.35, 2.4], 12),
  'proximal-fold': f([2.9, 4.7, 0.2], 10, { main: true }),
  eponychium: f([6.2, 4.3, 0.2], 7),
  'nail-cuticle': f([7.4, 4.1, 0.2], 7),
  'lateral-folds': f([13, 4.4, 5.7], 14),
  hyponychium: f([22.3, 3.0, 0.2], 8, { main: true }),
  'germinal-matrix': f([3.8, 3.2, 0.2], 8, { main: true }),
  'sterile-matrix': f([14, 3.25, 0.2], 10),
  'bed-ridges': f([16, 3.05, 1.8], 12),
  'matrix-melanocytes': f([3.0, 3.35, 0.2], 7),
  'nail-bed-dermis': f([14, 2.4, 0.2], 12),
  'distal-phalanx': f([10, 0.7, 0.2], 18, { main: true }),
  'phalanx-tuft': f([19.5, 0.9, 0.2], 11),
  'middle-phalanx-head': f([-7, 0, 0.2], 14),
  'joint-cartilage': f([-1.2, 0.6, 0.2], 9),
  'collateral-ligament': f([-1.0, 0.2, -4.7], 12),
  'extensor-tendon': f([-7, 2.95, 0.2], 11),
  'flexor-tendon': f([-7, -2.35, 0.2], 11),
  'finger-pulp': f([15, -2.7, 0.2], 18, { main: true }),
  'fat-septa': f([6, -2.4, 0.2], 11),
  'finger-skin': f([10, -4.1, 0.2], 14),
  fingerprint: f([17, -4.6, 0.2], 11, { main: true }),
  'eccrine-glands': f([13, -3.4, -0.6], 9),
  pacinian: f([8, -3.2, -1.6], 8),
  meissner: f([20, -3.9, -0.3], 8),
  'digital-artery': f([-8, -1.4, -3.5], 14, { main: true }),
  'digital-vein': f([-8, 2.9, -2.4], 13),
  'digital-nerve': f([-8, -2.3, -3.4], 12),
  'nail-arcade': f([4.6, 2.7, 0.1], 8),
  'nail-capillaries': f([12, 3.0, 0.1], 8),
  glomus: f([18.5, 2.35, 0.1], 8),
};
for (const [id, info] of Object.entries(nailInfo)) INFO[id] = { ...info, at: info.at };

export const MAIN_LABELS = new Set<string>(Object.entries(INFO).filter(([, i]) => i.main).map(([id]) => id));
export const INNER_LABELS = new Set<string>(HAIR_PART_IDS);

/** Точка подписи части (в системе сцены; сцена «ноготь» повёрнута целиком). */
export const LABEL_AT: Record<string, V3> = Object.fromEntries(Object.entries(INFO).map(([id, i]) => [id, i.at]));

const groupDist: Record<SceneId, number> = { follicle: 24, shaft: 32, cycle: 30, nail: 50 };
const groupAt: Record<HairGroupId, V3> = {
  'g-hair': [4.2, 1.2, 0],
  'g-sheaths': [2.2, -4.2, 0],
  'g-skin': [0, -4.8, 0],
  'g-glands': [1.5, -2.0, 0],
  'g-vessels': [1.5, -5.0, 0],
  'g-fibre': [3.6, 0, 0],
  'g-types': [0.5, -5.6, 0],
  'g-cycle': [0, -3.4, 0],
  'g-plate': [14, 4, 0],
  'g-folds': [10, 4, 0],
  'g-matrix': [9, 3, 0],
  'g-finger': [8, 0, 0],
  'g-nailvessels': [4, 0, 0],
};

/** Куда летит камера для каждой части и группы. */
export const FOCUS: Record<string, Focus> = {};
for (const id of HAIR_PART_IDS) {
  const i = INFO[id];
  const scene = sceneOf(id) as SceneId;
  const at: V3 = scene === 'nail' ? nailWorld(i.at) : i.at;
  FOCUS[id] = { at: [at[0], at[1], 0], dir: i.dir ?? dirOf(scene), dist: i.dist };
}
for (const g of Object.keys(HAIR_GROUPS) as HairGroupId[]) {
  const scene = SCENE_OF_GROUP[g];
  const at = scene === 'nail' ? nailWorld(groupAt[g]) : groupAt[g];
  FOCUS[g] = { at, dir: dirOf(scene), dist: groupDist[scene] };
}

/** Разнос на части: кожа расходится слоями по вертикали, остальное — от центра сцены. */
const CENTER: Record<SceneId, V3> = { follicle: [2.2, -4, 0], shaft: [3.6, -0.5, 0], cycle: [0, -3.4, 0], nail: [9, 0, 0] };
const SKIN_STACK: Record<string, number> = {
  'stratum-corneum': 5.5,
  epidermis: 4.4,
  'basal-layer': 3.5,
  'papillary-dermis': 1.8,
  'reticular-dermis': -1.0,
  hypodermis: -4.6,
  'fat-lobules': -6.6,
  collagen: -2.8,
};
export const SPREAD: Record<string, V3> = {};
for (const id of HAIR_PART_IDS) {
  const scene = sceneOf(id) as SceneId;
  const a = INFO[id].at;
  const c = CENTER[scene];
  if (id in SKIN_STACK) {
    SPREAD[id] = [0, SKIN_STACK[id], 0.8];
    continue;
  }
  const d = sub(a, c);
  const k = scene === 'nail' ? 0.42 : scene === 'shaft' ? 0.5 : 0.55;
  SPREAD[id] = scene === 'nail' ? [d[0] * k * 0.5, d[1] * k * 1.8 + 2, d[2] * 0.2 + 2.2] : [d[0] * k * 0.55, d[1] * k * 0.55, 2.6 + (GROUP_OF[id] === 'g-vessels' ? 1.4 : 0)];
}

export const FOLLICLE_AXIS = AX;
export const UP = up;
