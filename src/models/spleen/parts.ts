import {
  ACCESSORY,
  ADRENAL,
  AX_D,
  AX_L,
  AX_W,
  BRANCHES,
  CELIAC_PTS,
  COLON_PTS,
  GASTROEPIPLOIC_PTS,
  HILAR_ENTRIES,
  HILUM_C,
  IMV_PTS,
  KIDNEY,
  LIG_GS,
  LIG_PS,
  LIG_SC,
  LIG_SR,
  LYMPH_NODES,
  P,
  PANCREAS_TAIL_PTS,
  PANCREATIC_BRANCHES,
  PORTAL_PTS,
  SHORT_GASTRIC,
  SPINE_X,
  SPINE_Z,
  SPLENIC_ARTERY_PTS,
  SPLENIC_VEIN_PTS,
  curveOf,
  visD,
  type V3,
} from './anatomy';
import { rimW } from './field';
import { ANCHORS as MA } from './micro';

/** Части модели селезёнки (id совпадают с пунктами «Из чего состоит») и их группы. */
export const SPLEEN_GROUPS = {
  'g-surface': [
    'diaphragmatic',
    'gastric-surface',
    'renal-surface',
    'colic-surface',
    'hilum',
    'superior-border',
    'notches',
    'inferior-border',
    'posterior-pole',
    'anterior-pole',
    'capsule',
    'serosa',
    'accessory-spleens',
  ],
  'g-internal': ['red-pulp', 'white-pulp', 'central-arteries', 'trabeculae', 'trabecular-arteries', 'trabecular-veins', 'segments', 'intersegmental'],
  'g-vessels': [
    'celiac-trunk',
    'splenic-artery',
    'pancreatic-branches',
    'sa-sup',
    'sa-mid',
    'sa-inf',
    'hilar-arteries',
    'short-gastric',
    'gastroepiploic-artery',
    'splenic-vein',
    'hilar-veins',
    'short-gastric-veins',
    'gastroepiploic-vein',
    'imv',
    'portal-vein',
    'lymph-nodes',
    'splenic-plexus',
  ],
  'g-ligaments': ['gastrosplenic', 'splenorenal', 'phrenicosplenic', 'splenocolic'],
  'g-neighbors': ['stomach', 'pancreatic-tail', 'left-kidney', 'left-adrenal', 'colon-flexure', 'diaphragm', 'ribs', 'spine', 'aorta'],
  'g-white': ['m-central-artery', 'm-pals', 'm-follicle', 'm-germinal', 'm-marginal-zone'],
  'g-red': ['m-penicillar', 'm-ellipsoid', 'm-cords', 'm-macrophage', 'm-plasma', 'm-sinus', 'm-littoral', 'm-annular', 'm-rbc', 'm-old-rbc', 'm-pulp-vein'],
  'g-frame': ['m-capsule', 'm-trabecula', 'm-trab-artery', 'm-trab-vein'],
} as const;

export type SpleenGroupId = keyof typeof SPLEEN_GROUPS;

export const SPLEEN_PART_IDS: string[] = Object.values(SPLEEN_GROUPS).flat();

export const GROUP_OF: Record<string, SpleenGroupId> = Object.fromEntries(
  (Object.entries(SPLEEN_GROUPS) as [SpleenGroupId, readonly string[]][]).flatMap(([g, ids]) => ids.map((id) => [id, g])),
);

/** Группы и части, которые видны только «под микроскопом». */
export const MICRO_GROUPS: SpleenGroupId[] = ['g-white', 'g-red', 'g-frame'];
export const MICRO_PART_IDS = new Set<string>(MICRO_GROUPS.flatMap((g) => SPLEEN_GROUPS[g] as readonly string[]));
export const MICRO_ONLY = new Set<string>([...MICRO_PART_IDS, ...MICRO_GROUPS]);
/** Части макромодели. */
export const MACRO_PART_IDS = SPLEEN_PART_IDS.filter((id) => !MICRO_PART_IDS.has(id));

/** Части, которые лежат внутри органа и показываются только при просвечивании, выборе или своём режиме. */
export const INTERNAL_PARTS = new Set<string>(['red-pulp', 'white-pulp', 'central-arteries', 'trabeculae', 'trabecular-arteries', 'trabecular-veins']);
/** Оболочка органа: становится почти прозрачной при просвечивании. */
export const XRAY_SHELL = new Set<string>(['diaphragmatic', 'gastric-surface', 'renal-surface', 'colic-surface', 'hilum', 'superior-border', 'notches', 'inferior-border', 'posterior-pole', 'anterior-pole']);

export interface Focus {
  at: V3;
  dir: V3;
  dist: number;
}

const norm = (v: V3): V3 => {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const mix = (...vs: [V3, number][]): V3 => [vs.reduce((s, [v, k]) => s + v[0] * k, 0), vs.reduce((s, [v, k]) => s + v[1] * k, 0), vs.reduce((s, [v, k]) => s + v[2] * k, 0)];
const neg = (v: V3): V3 => [-v[0], -v[1], -v[2]];
const up: V3 = [0, 1, 0];

/** Общий вид: взгляд на внутренностную поверхность и ворота — спереди и чуть изнутри; желудок стеклянный. */
export const VIEW_VISCERAL: V3 = norm(mix([neg(AX_D), 0.55], [[0, 0, 1], 0.7], [up, 0.28]));
export const OVERVIEW: Focus = { at: [-2.2, -0.6, 0.4], dir: VIEW_VISCERAL, dist: 42 };
/** Камера для трёх видов среза: на стороне, где убрана часть. */
export const CUT_VIEWS: Record<'side' | 'fundus' | 'coronal', Focus> = {
  side: { at: [0, 0, 0], dir: norm(mix([neg(AX_D), 1], [up, 0.22])), dist: 30 },
  fundus: { at: [0, 0, 0], dir: norm(mix([AX_L, 1], [up, 0.3], [neg(AX_D), 0.25])), dist: 30 },
  coronal: { at: [0, 0, 0], dir: norm(mix([AX_W, 1], [neg(AX_D), 0.35])), dist: 30 },
};
export const SPREAD_VIEW: Focus = { at: [-2.5, -0.5, 0.5], dir: norm(mix([neg(AX_D), 0.6], [[0, 0, 1], 0.6], [up, 0.3])), dist: 98 };
export const MICRO_VIEW: Focus = { at: [0, -0.1, 0], dir: [0, 0.04, 1], dist: 66 };

interface Info {
  at: V3;
  dist: number;
  dir?: V3;
  label?: V3;
  main?: boolean;
  inner?: boolean;
}

const D: V3 = VIEW_VISCERAL;
const i = (at: V3, dist: number, o: Partial<Info> = {}): Info => ({ at, dist, ...o });
const along = (pts: V3[], t: number): V3 => {
  const p = curveOf(pts).getPointAt(t);
  return [p.x, p.y, p.z];
};
const surf = (l: number, w: number, dOff = 0): V3 => P(l, w, visD(l, w) + dOff);
const m = (id: string, dist: number, dir: V3 = [0, 0.04, 1]): Info => i(MA[id], dist, { dir, inner: true });
const dia = norm(mix([AX_D, 1], [up, 0.2]));
const vis = norm(mix([neg(AX_D), 1], [up, 0.2]));

const INFO: Record<string, Info> = {
  diaphragmatic: i(P(0.3, -1.0, 2.3), 20, { dir: dia, main: true }),
  'gastric-surface': i(surf(1.5, 2.1, 0.05), 15, { dir: vis }),
  'renal-surface': i(surf(-2.4, -2.0, 0.05), 15, { dir: vis }),
  'colic-surface': i(surf(4.4, -0.6, 0.05), 13, { dir: vis }),
  hilum: i(HILUM_C, 12, { dir: vis, main: true, label: P(0.4, hilumLabelW(), visD(0.4, hilumLabelW()) + 0.05) }),
  'superior-border': i(P(-1.7, rimW(-1.7) - 0.15, -0.1), 15, { dir: norm(mix([AX_W, 1], [neg(AX_D), 0.3])) }),
  notches: i(P(2.2, rimW(2.2) - 0.1, -0.05), 10, { dir: norm(mix([AX_W, 1], [neg(AX_D), 0.4])), main: true }),
  'inferior-border': i(P(-0.6, -rimW(-0.6) + 0.2, -0.1), 15, { dir: norm(mix([neg(AX_W), 1], [AX_D, 0.4])) }),
  'posterior-pole': i(P(-5.6, 0.1, -0.15), 14, { dir: norm(mix([neg(AX_L), 1], [up, 0.25])) }),
  'anterior-pole': i(P(5.6, 0.1, -0.15), 14, { dir: norm(mix([AX_L, 1], [up, 0.25])) }),
  capsule: i(P(-3.0, -1.7, 1.6), 20, { dir: dia, label: P(-3.0, -1.7, 1.6) }),
  serosa: i(P(2.8, -1.5, 1.5), 20, { dir: dia, label: P(2.6, -1.6, 1.55) }),
  'accessory-spleens': i(ACCESSORY[0].c, 9, { dir: D }),

  'red-pulp': i(P(1.0, -0.6, 0.3), 16, { inner: true, dir: D }),
  'white-pulp': i(P(-0.5, -1.2, 0.7), 12, { inner: true, dir: D }),
  'central-arteries': i(P(-1.0, -0.2, 0.2), 10, { inner: true, dir: D }),
  trabeculae: i(P(0.5, 0.5, 0.6), 14, { inner: true, dir: D }),
  'trabecular-arteries': i(P(-1.4, 0.3, 0.5), 11, { inner: true, dir: D }),
  'trabecular-veins': i(P(1.2, 0.4, 0.4), 11, { inner: true, dir: D }),
  segments: i(P(0, 0, 0.3), 18, { inner: true, dir: D }),
  intersegmental: i(P(0, 0, 0.1), 18, { inner: true, dir: D }),

  'celiac-trunk': i(CELIAC_PTS[1], 9, { inner: true, label: [CELIAC_PTS[1][0] - 0.3, CELIAC_PTS[1][1] - 1.1, CELIAC_PTS[1][2] + 0.1] }),
  'splenic-artery': i(along(SPLENIC_ARTERY_PTS, 0.45), 14, { main: true, inner: true }),
  'pancreatic-branches': i(PANCREATIC_BRANCHES[1][1], 8, { inner: true }),
  'sa-sup': i(BRANCHES[0].trunk[1], 8, { inner: true, dir: D }),
  'sa-mid': i(BRANCHES[1].trunk[1], 8, { inner: true, dir: D }),
  'sa-inf': i(BRANCHES[2].trunk[1], 8, { inner: true, dir: D }),
  'hilar-arteries': i(HILAR_ENTRIES[3], 9, { inner: true, dir: D }),
  'short-gastric': i(along(SHORT_GASTRIC[2], 0.55), 11, { inner: true, dir: D }),
  'gastroepiploic-artery': i(along(GASTROEPIPLOIC_PTS, 0.5), 15, { inner: true, dir: D }),
  'splenic-vein': i(along(SPLENIC_VEIN_PTS, 0.4), 14, { inner: true }),
  'hilar-veins': i(HILAR_ENTRIES[4], 9, { inner: true, dir: D }),
  'short-gastric-veins': i(along(SHORT_GASTRIC[3], 0.5), 11, { inner: true, dir: D }),
  'gastroepiploic-vein': i(along(GASTROEPIPLOIC_PTS, 0.7), 15, { inner: true, dir: D }),
  imv: i(along(IMV_PTS, 0.45), 14, { inner: true }),
  'portal-vein': i(along(PORTAL_PTS, 0.45), 12, { inner: true }),
  'lymph-nodes': i(LYMPH_NODES[1].c, 12, { inner: true }),
  'splenic-plexus': i(along(SPLENIC_ARTERY_PTS, 0.3), 10, { inner: true }),

  gastrosplenic: i(along(LIG_GS.a, 0.5), 14, { dir: D, label: mix([along(LIG_GS.a, 0.5), 0.55], [along(LIG_GS.b, 0.5), 0.45]) }),
  splenorenal: i(along(LIG_SR.a, 0.5), 14, { dir: D, label: mix([along(LIG_SR.a, 0.5), 0.5], [along(LIG_SR.b, 0.5), 0.5]) }),
  phrenicosplenic: i(along(LIG_PS.a, 0.5), 12, { dir: dia, label: mix([along(LIG_PS.a, 0.5), 0.5], [along(LIG_PS.b, 0.5), 0.5]) }),
  splenocolic: i(along(LIG_SC.a, 0.5), 12, { dir: vis, label: mix([along(LIG_SC.a, 0.5), 0.5], [along(LIG_SC.b, 0.5), 0.5]) }),

  stomach: i(P(1.0, 3.0, -4.6), 26, { dir: D, main: true, label: P(2.2, 4.8, -3.4) }),
  'pancreatic-tail': i(PANCREAS_TAIL_PTS[1], 12, { dir: D }),
  'left-kidney': i(KIDNEY.c, 22, { dir: D, main: true, inner: true, label: [KIDNEY.c[0] - 0.4, KIDNEY.c[1] + 0.8, KIDNEY.c[2] + 1.4] }),
  'left-adrenal': i(ADRENAL.c, 9, { dir: D, inner: true }),
  'colon-flexure': i(along(COLON_PTS, 0.55), 18, { dir: D, label: along(COLON_PTS, 0.62) }),
  diaphragm: i(P(-1.0, 1.0, 3.7), 24, { dir: dia, label: P(-2.0, 2.2, 3.7) }),
  ribs: i(P(-0.2, 0.4, 4.7), 22, { dir: dia, label: P(1.5, 0.4, 4.7) }),
  spine: i([SPINE_X, 0.5, SPINE_Z], 24, { dir: D, inner: true, label: [SPINE_X + 0.2, 6.9, SPINE_Z + 1.2] }),
  aorta: i([-8.0, 3.2, -1.7], 20, { dir: D, inner: true, label: [-8.0, 4.6, -0.6] }),

  'm-capsule': m('m-capsule', 14),
  'm-trabecula': m('m-trabecula', 14),
  'm-trab-artery': m('m-trab-artery', 12),
  'm-trab-vein': m('m-trab-vein', 12),
  'm-central-artery': m('m-central-artery', 14),
  'm-pals': m('m-pals', 14),
  'm-follicle': m('m-follicle', 12),
  'm-germinal': m('m-germinal', 8),
  'm-marginal-zone': m('m-marginal-zone', 14),
  'm-penicillar': m('m-penicillar', 10),
  'm-ellipsoid': m('m-ellipsoid', 8),
  'm-cords': m('m-cords', 18),
  'm-macrophage': m('m-macrophage', 8),
  'm-plasma': m('m-plasma', 8),
  'm-sinus': m('m-sinus', 14),
  'm-littoral': m('m-littoral', 8),
  'm-annular': m('m-annular', 7),
  'm-rbc': m('m-rbc', 8),
  'm-old-rbc': m('m-old-rbc', 8),
  'm-pulp-vein': m('m-pulp-vein', 14),
};

function hilumLabelW(): number {
  return 0.25 - 0.07 * 0.4;
}

const groupFocus = (at: V3, dist: number, dir: V3 = D): Focus => ({ at, dir, dist });

export const FOCUS: Record<string, Focus> = {
  ...Object.fromEntries(Object.entries(INFO).map(([id, f]) => [id, { at: f.at, dir: f.dir ?? D, dist: f.dist }])),
  'g-surface': groupFocus([0, 0, 0.2], 24),
  'g-internal': groupFocus([0, 0, 0.2], 22),
  'g-vessels': groupFocus([-3.4, 0.2, 0.9], 40),
  'g-ligaments': groupFocus([-1.2, -0.4, 0.2], 30),
  'g-neighbors': groupFocus([-3.0, -1.0, 0], 66),
  'g-white': { at: [-3.4, 1.2, 0], dir: [0, 0.04, 1], dist: 30 },
  'g-red': { at: [6.0, -0.3, 0], dir: [0, 0.04, 1], dist: 34 },
  'g-frame': { at: [-5.0, 0, 0], dir: [0.1, 0.04, 1], dist: 40 },
};

/** Якоря подписей на модели (координаты сцены). */
export const LABEL_AT: Record<string, V3> = Object.fromEntries(Object.entries(INFO).map(([id, f]) => [id, f.label ?? f.at]));

/** Какие части подписаны на модели сразу (остальные — при выборе). */
export const MAIN_LABELS = new Set(Object.entries(INFO).filter(([, f]) => f.main).map(([id]) => id));
export const MICRO_MAIN_LABELS = new Set<string>(['m-capsule', 'm-trabecula', 'm-follicle', 'm-sinus', 'm-pulp-vein']);

/** Подписи внутренних частей видны сквозь ткани и не прячутся при повороте. */
export const INNER_LABELS = new Set(Object.entries(INFO).filter(([, f]) => f.inner).map(([id]) => id));

/* ---------- Разнос при «Разобрать» ---------- */

const CENTER: V3 = [-1.5, 0, 0.3];
const K: Record<string, number> = { 'g-surface': 3.6, 'g-internal': 2.2, 'g-vessels': 5.5, 'g-ligaments': 6.0, 'g-neighbors': 9 };

/** Сдвиг части при полном разносе: от центра органа, у каждой группы свой размах. */
export const SPREAD: Record<string, V3> = (() => {
  const res: Record<string, V3> = {};
  for (const id of MACRO_PART_IDS) {
    const at = INFO[id].at;
    let v: V3 = [at[0] - CENTER[0], at[1] - CENTER[1], at[2] - CENTER[2]];
    const l = Math.hypot(...v) || 1;
    const k = K[GROUP_OF[id]] ?? 5;
    v = [(v[0] / l) * k, (v[1] / l) * k, (v[2] / l) * k];
    res[id] = v;
  }
  // оболочки без своего «центра» отводим по нормали к поверхностям
  res.capsule = [AX_D[0] * 2.2, AX_D[1] * 2.2, AX_D[2] * 2.2];
  res.serosa = [AX_D[0] * 3.8, AX_D[1] * 3.8, AX_D[2] * 3.8];
  res['red-pulp'] = [0, 0, 0];
  res['white-pulp'] = [0, 0, 0];
  res['central-arteries'] = [0, 0, 0];
  res.trabeculae = [0, 0, 0];
  res['trabecular-arteries'] = [0, 0, 0];
  res['trabecular-veins'] = [0, 0, 0];
  res.segments = [0, 0, 0];
  res.intersegmental = [0, 0, 0];
  return res;
})();

export const GROUP_IDS = Object.keys(SPLEEN_GROUPS) as SpleenGroupId[];
