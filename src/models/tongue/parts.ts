import { CARUNCLE, GENIAL, PALATE, STYLOID_TIP, SUBLINGUAL, SUBMANDIBULAR, U_FORAMEN, epiglottisPoint, inside, topV, botV, uSulcus, type SceneId } from './anatomy';
import type { V3 } from './geometry';

/** Части модели (id совпадают с пунктами «Из чего состоит») по группам. */
export const TONGUE_GROUPS = {
  'g-regions': ['apex', 'body', 'root', 'dorsum', 'ventral-surface'],
  'g-landmarks': ['median-sulcus', 'terminal-sulcus', 'foramen-cecum', 'frenulum', 'fimbriated-fold', 'sublingual-caruncle'],
  'g-papillae': ['filiform', 'fungiform', 'foliate', 'vallate', 'lingual-tonsil'],
  'g-intrinsic': ['sup-longitudinal', 'inf-longitudinal', 'transverse', 'vertical', 'septum'],
  'g-extrinsic': ['genioglossus', 'hyoglossus', 'styloglossus', 'palatoglossus'],
  'g-support': ['hyoid', 'mandible', 'styloid', 'epiglottis'],
  'g-vessels': ['lingual-artery', 'deep-lingual-artery', 'lingual-vein', 'deep-lingual-vein'],
  'g-nerves': ['hypoglossal', 'lingual-nerve', 'chorda-tympani', 'glossopharyngeal', 'vagus'],
  'g-glands': ['submandibular-gland', 'submandibular-duct', 'sublingual-gland', 'sublingual-ducts', 'ebner-glands'],
  'g-bud': [
    'b-epithelium',
    'b-basement',
    'b-core',
    'b-capillaries',
    'b-nerve',
    'taste-bud',
    'taste-pore',
    'taste-hairs',
    'cell-type1',
    'cell-type2',
    'cell-type3',
    'cell-basal',
    'b-fibers',
    'b-saliva',
  ],
} as const;

export type TongueGroupId = keyof typeof TONGUE_GROUPS;

export const TONGUE_PART_IDS: string[] = Object.values(TONGUE_GROUPS).flat();

export const GROUP_OF: Record<string, TongueGroupId> = Object.fromEntries(
  (Object.entries(TONGUE_GROUPS) as [TongueGroupId, readonly string[]][]).flatMap(([g, ids]) => ids.map((id) => [id, g])),
);

/** Сцена, в которой живёт часть или группа. */
export const sceneOf = (id: string): SceneId | null => {
  if (id === 'g-bud') return 'bud';
  if (id in TONGUE_GROUPS) return 'tongue';
  const g = GROUP_OF[id];
  if (!g) return null;
  return g === 'g-bud' ? 'bud' : 'tongue';
};

export const SCENE_PARTS: Record<SceneId, string[]> = {
  tongue: TONGUE_PART_IDS.filter((id) => sceneOf(id) === 'tongue'),
  bud: TONGUE_PART_IDS.filter((id) => sceneOf(id) === 'bud'),
};

/** Слизистая и сосочки: становятся почти прозрачными при просвечивании, открывая мышцы. */
export const XRAY_SHELL = new Set<string>([
  ...TONGUE_GROUPS['g-regions'],
  'median-sulcus',
  'terminal-sulcus',
  'foramen-cecum',
  'fimbriated-fold',
  'filiform',
  'fungiform',
  'foliate',
  'vallate',
  'lingual-tonsil',
  'b-epithelium',
  'ctx-core',
]);

/** Части, которые двигаются вместе с языком (смещение вершин в шейдере); кости, железы и мышечные «якоря» стоят на месте. */
export const MOVING = new Set<string>([
  ...TONGUE_GROUPS['g-regions'],
  ...TONGUE_GROUPS['g-landmarks'].filter((id) => id !== 'sublingual-caruncle'),
  ...TONGUE_GROUPS['g-papillae'],
  ...TONGUE_GROUPS['g-intrinsic'],
  ...TONGUE_GROUPS['g-extrinsic'],
  ...TONGUE_GROUPS['g-vessels'],
  ...TONGUE_GROUPS['g-nerves'],
  'ebner-glands',
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
const P = (u: number, z: number, v: number): V3 => {
  const p = inside(u, z, v);
  return [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)];
};
const TOP = (u: number, z: number, lift = 0.05): V3 => P(u, z, topV(u, z) + lift);
const BOT = (u: number, z: number, lift = 0.05): V3 => P(u, z, botV(u, z) - lift);

/** Общий вид: три четверти слева-спереди и чуть сверху. */
const FRONT: V3 = norm([0.62, 0.55, 0.78]);
const SIDE: V3 = norm([0.08, 0.12, 1]);
const ABOVE: V3 = norm([0.25, 1, 0.35]);
const BELOW: V3 = norm([0.55, -0.7, 0.6]);
const BACK: V3 = norm([-0.75, 0.45, 0.6]);

export const OVERVIEW: Record<SceneId, Focus> = {
  tongue: { at: [0.2, -1.1, 0], dir: FRONT, dist: 27 },
  bud: { at: [0, 2.4, 0], dir: norm([0.12, 0.22, 1]), dist: 19 },
};

export const CUT_VIEWS: Record<SceneId, Record<'side' | 'fundus' | 'coronal', Focus>> = {
  tongue: {
    side: { at: [0.3, -1.2, 0], dir: SIDE, dist: 21 },
    fundus: { at: [1.5, -1.0, 0], dir: norm([1, 0.25, 0.3]), dist: 15 },
    coronal: { at: [0.5, -0.4, 0], dir: norm([0.2, 1, 0.3]), dist: 19 },
  },
  bud: {
    side: { at: [0, 2.4, 0], dir: norm([0.06, 0.12, 1]), dist: 17 },
    fundus: { at: [0, 2.4, 0], dir: norm([1, 0.2, 0.12]), dist: 17 },
    coronal: { at: [0, 3.2, 0], dir: norm([0.15, 1, 0.3]), dist: 18 },
  },
};

export const SPREAD_VIEW: Record<SceneId, Focus> = {
  tongue: { at: [-0.6, -0.4, 0], dir: FRONT, dist: 36 },
  bud: { at: [0, 3, 0], dir: norm([0.25, 0.3, 1]), dist: 38 },
};

interface Info {
  at: V3;
  dist: number;
  dir?: V3;
  main?: boolean;
}
const i = (at: V3, dist: number, o: { dir?: V3; main?: boolean } = {}): Info => ({ at, dist, ...o });

/** Камера ставится в 3D-сцене языка (см) и микросцене (условные единицы ~0,1 мм). */
const BUD_TOP = 4.6;
const INFO: Record<string, Info> = {
  apex: i(TOP(0.97, 0.3, 0.1), 7, { main: true }),
  body: i(P(0.68, 2.3, 0.1), 9, { main: true }),
  root: i(P(0.12, 0.9, topV(0.12, 0.9) + 0.1), 9, { dir: BACK, main: true }),
  dorsum: i(TOP(0.62, -0.9, 0.12), 10, { dir: ABOVE, main: true }),
  'ventral-surface': i(BOT(0.8, -0.8, 0.1), 8, { dir: BELOW }),
  'median-sulcus': i(TOP(0.72, 0, 0.06), 6, { dir: ABOVE }),
  'terminal-sulcus': i(TOP(uSulcus(1.2), 1.2, 0.06), 6.5, { dir: ABOVE }),
  'foramen-cecum': i(TOP(U_FORAMEN, 0, 0.06), 4.5, { dir: norm([-0.3, 1, 0.3]) }),
  frenulum: i([2.6, -1.3, 0], 6, { dir: BELOW, main: true }),
  'fimbriated-fold': i(BOT(0.82, 0.95, 0.06), 5.5, { dir: BELOW }),
  'sublingual-caruncle': i(CARUNCLE(1), 5, { dir: BELOW }),
  filiform: i(TOP(0.8, 0.9, 0.1), 4.5, { dir: ABOVE }),
  fungiform: i(TOP(0.92, 0.75, 0.1), 4.5, { dir: ABOVE, main: true }),
  foliate: i(P(0.5, 2.3, 0.35), 5.5, { dir: norm([0.2, 0.3, 1]) }),
  vallate: i(TOP(uSulcus(0.7) + 0.035, 0.7, 0.12), 5, { dir: norm([0.1, 1, 0.35]), main: true }),
  'lingual-tonsil': i(TOP(0.24, 0.6, 0.15), 6, { dir: BACK }),
  'sup-longitudinal': i(P(0.66, 0.6, topV(0.66, 0.6) - 0.25), 8, { dir: SIDE }),
  'inf-longitudinal': i(P(0.66, 0.9, botV(0.66, 0.9) * 0.6), 8, { dir: SIDE }),
  transverse: i(P(0.6, 1.2, 0), 8, { dir: norm([1, 0.25, 0.3]) }),
  vertical: i(P(0.75, 0.9, 0.1), 8, { dir: norm([1, 0.25, 0.3]) }),
  septum: i(P(0.6, 0, 0.1), 9, { dir: SIDE }),
  genioglossus: i([2.6, -2.3, 0.4], 10, { dir: SIDE, main: true }),
  hyoglossus: i([-2.8, -2.6, 1.9], 9, { dir: norm([0.2, 0.15, 1]) }),
  styloglossus: i([-3.4, 0.0, 2.6], 9, { dir: norm([0.2, 0.25, 1]) }),
  palatoglossus: i([-0.95, 1.8, 1.55], 8, { dir: norm([0.4, 0.3, 1]) }),
  hyoid: i([-2.7, -3.95, 1.0], 9, { main: true }),
  mandible: i([3.9, -2.85, 2.3], 16),
  styloid: i(STYLOID_TIP, 7, { dir: norm([0.1, 0.2, 1]) }),
  epiglottis: i(((): V3 => {
    const p = epiglottisPoint(0.75, 0.3, -0.05);
    return [p.x, p.y, p.z];
  })(), 8, { dir: BACK }),
  'lingual-artery': i([-4.25, -3.15, 1.7], 8, { dir: norm([0.1, 0.3, 1]) }),
  'deep-lingual-artery': i(P(0.75, 0.75, botV(0.75, 0.75) * 0.62), 8, { dir: BELOW }),
  'lingual-vein': i([-2.9, -3.2, 2.25], 8, { dir: norm([0.1, 0.2, 1]) }),
  'deep-lingual-vein': i(BOT(0.78, 0.55, 0.08), 6, { dir: BELOW }),
  hypoglossal: i([-3.35, -2.95, 1.98], 9, { dir: norm([0.15, 0.2, 1]), main: true }),
  'lingual-nerve': i([-3.0, -0.55, 2.9], 9, { dir: norm([0.2, 0.2, 1]) }),
  'chorda-tympani': i([-5.0, 2.5, 3.4], 7, { dir: norm([0.2, 0.2, 1]) }),
  glossopharyngeal: i([-5.0, -0.95, 2.2], 8, { dir: norm([-0.1, 0.25, 1]) }),
  vagus: i([-6.55, -1.5, 3.1], 9, { dir: norm([0.1, 0.15, 1]) }),
  'submandibular-gland': i(SUBMANDIBULAR.c, 9, { dir: norm([0.2, -0.2, 1]) }),
  'submandibular-duct': i([1.5, -2.08, 1.3], 7, { dir: BELOW }),
  'sublingual-gland': i([SUBLINGUAL.c[0], SUBLINGUAL.c[1], SUBLINGUAL.c[2]], 7, { dir: BELOW }),
  'sublingual-ducts': i([1.95, -1.85, 1.6], 5, { dir: BELOW }),
  'ebner-glands': i(P(uSulcus(0.7) + 0.035, 0.7, topV(0.45, 0.7) - 0.45), 5, { dir: norm([0.4, 0.6, 0.9]) }),
  'b-epithelium': i([6.5, 0.1, 0], 18, { main: true }),
  'b-basement': i([2.4, 1.9, 0], 12),
  'b-core': i([0, -2.5, 0], 16, { main: true }),
  'b-capillaries': i([1.2, 0.5, 0], 12),
  'b-nerve': i([-0.5, -2.6, 0], 12),
  'taste-bud': i([0, BUD_TOP - 1.0, 0], 8, { main: true }),
  'taste-pore': i([0, BUD_TOP + 0.05, 0], 4.5, { main: true }),
  'taste-hairs': i([0, BUD_TOP - 0.1, 0], 3.5),
  'cell-type1': i([-0.25, BUD_TOP - 1.0, 0], 5),
  'cell-type2': i([0.2, BUD_TOP - 1.0, 0], 5),
  'cell-type3': i([0.05, BUD_TOP - 0.9, 0], 5),
  'cell-basal': i([0, BUD_TOP - 1.95, 0], 5),
  'b-fibers': i([0, BUD_TOP - 2.25, 0], 6, { main: true }),
  'b-saliva': i([-2.2, BUD_TOP + 0.2, 0], 9),
};

export const MAIN_LABELS = new Set<string>(Object.entries(INFO).filter(([, x]) => x.main).map(([id]) => id));
/** Внутренние части подписываются «внутренней» плашкой. */
export const INNER_LABELS = new Set<string>([...TONGUE_GROUPS['g-intrinsic'], ...TONGUE_GROUPS['g-bud'], 'ebner-glands', 'deep-lingual-artery']);

export const LABEL_AT: Record<string, V3> = Object.fromEntries(Object.entries(INFO).map(([id, x]) => [id, x.at]));

const groupFocus: Record<TongueGroupId, Focus> = {
  'g-regions': { at: [0.8, -0.2, 0], dir: FRONT, dist: 18 },
  'g-landmarks': { at: [1.0, -0.2, 0], dir: norm([0.6, 0.15, 0.8]), dist: 15 },
  'g-papillae': { at: [0.6, 0.6, 0], dir: ABOVE, dist: 15 },
  'g-intrinsic': { at: [0.8, -0.1, 0], dir: FRONT, dist: 15 },
  'g-extrinsic': { at: [-0.6, -1.4, 0], dir: norm([0.3, 0.2, 1]), dist: 20 },
  'g-support': { at: [0, -2.4, 0], dir: FRONT, dist: 24 },
  'g-vessels': { at: [-0.8, -1.8, 0], dir: norm([0.25, -0.1, 1]), dist: 20 },
  'g-nerves': { at: [-2.2, -0.4, 0], dir: norm([0.25, 0.1, 1]), dist: 22 },
  'g-glands': { at: [0.3, -2.4, 0], dir: BELOW, dist: 16 },
  'g-bud': { at: [0, 2.4, 0], dir: norm([0.12, 0.22, 1]), dist: 19 },
};

/** Куда летит камера для каждой части и группы. */
export const FOCUS: Record<string, Focus> = {};
for (const id of TONGUE_PART_IDS) {
  const x = INFO[id];
  const scene = sceneOf(id) as SceneId;
  FOCUS[id] = { at: x.at, dir: x.dir ?? (scene === 'bud' ? norm([0.1, 0.15, 1]) : FRONT), dist: x.dist };
}
for (const g of Object.keys(TONGUE_GROUPS) as TongueGroupId[]) FOCUS[g] = groupFocus[g];

/** Разнос на части: слизистая поднимается, мышцы и кости расходятся вниз и в стороны, сосуды и нервы — назад. */
export const SPREAD: Record<string, V3> = {
  apex: [1.6, 1.2, 0],
  body: [0.3, 1.4, 0],
  root: [-1.6, 1.0, 0],
  dorsum: [0.2, 2.8, 0],
  'ventral-surface': [0.8, -0.9, 0],
  'median-sulcus': [0.2, 3.6, 0],
  'terminal-sulcus': [-0.4, 3.6, 0],
  'foramen-cecum': [-0.6, 4.0, 0],
  frenulum: [1.2, -1.6, 0],
  'fimbriated-fold': [1.0, -1.3, 0],
  'sublingual-caruncle': [1.8, -2.0, 0],
  filiform: [0.4, 4.4, 0],
  fungiform: [0.6, 5.0, 0],
  foliate: [0, 3.0, 1.2],
  vallate: [-0.6, 4.6, 0],
  'lingual-tonsil': [-2.2, 3.2, 0],
  'sup-longitudinal': [0, 0.9, 0],
  'inf-longitudinal': [0.2, -0.7, 0],
  transverse: [0, 0, 0],
  vertical: [0.4, 0.1, 0],
  septum: [0, 0.2, 0],
  genioglossus: [0.6, -2.0, 0],
  hyoglossus: [-0.8, -1.8, 0.5],
  styloglossus: [-1.8, 0.8, 0.6],
  palatoglossus: [-0.6, 2.0, 0],
  hyoid: [-0.6, -3.2, 0],
  mandible: [1.2, -3.6, 0],
  styloid: [-2.6, 1.2, 0],
  epiglottis: [-2.8, -0.6, 0],
  'lingual-artery': [-2.4, -0.8, 0.8],
  'deep-lingual-artery': [0.4, -1.4, 0],
  'lingual-vein': [-2.2, -1.2, 1.2],
  'deep-lingual-vein': [0.8, -1.9, 0],
  hypoglossal: [-2.6, -0.4, 1.6],
  'lingual-nerve': [-2.0, 1.2, 1.5],
  'chorda-tympani': [-2.6, 1.8, 1.4],
  glossopharyngeal: [-3.0, 0.6, 1.2],
  vagus: [-3.6, 0, 1.4],
  'submandibular-gland': [-0.4, -2.6, 1.6],
  'submandibular-duct': [0.6, -2.4, 0.9],
  'sublingual-gland': [1.4, -2.6, 0.9],
  'sublingual-ducts': [1.4, -1.9, 0.9],
  'ebner-glands': [-0.6, 2.4, 0],
  'b-epithelium': [0, 2.4, -1.2],
  'b-basement': [0, 0.9, 0.4],
  'b-core': [0, -3.0, 0],
  'b-capillaries': [2.2, -1.6, 1.4],
  'b-nerve': [-2.2, -2.4, 1.4],
  'taste-bud': [0, 3.6, 2.4],
  'taste-pore': [0, 6.2, 2.6],
  'taste-hairs': [0, 5.4, 2.6],
  'cell-type1': [-2.4, 3.0, 2.8],
  'cell-type2': [2.4, 3.0, 2.8],
  'cell-type3': [0, 2.0, 3.2],
  'cell-basal': [0, 0.6, 3.0],
  'b-fibers': [0, -0.6, 3.0],
  'b-saliva': [0, 6.8, 0],
};

/** Ориентиры для сборки (используются в build). */
export const ANCHORS = { genial: GENIAL, palate: PALATE, budTop: BUD_TOP };
