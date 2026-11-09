import { CatmullRomCurve3, Vector3 } from 'three';
import { frameAt, lerp, makeFrames, smoothstep, type V3 } from '../gallbladder/anatomy';

export { lerp, smoothstep };
export type { V3 };

/*
  Поджелудочная железа, вид спереди. Единица — примерно 1 см.
  +x — налево от пациента (вправо на экране), +y — вверх, +z — к зрителю (вперёд, к животу).
  Позвоночник сзади (z около -8.6), аорта и нижняя полая вена перед ним, железа лежит поперёк них на уровне L1–L3:
  головка в изгибе двенадцатиперстной кишки справа от пациента (слева на экране), хвост идёт к воротам селезёнки.
*/

/** Осевая линия шейки, тела и хвоста: от шейки (у головки) до кончика хвоста. */
export const SWEEP_PTS: V3[] = [
  [-2.8, 0.35, -0.25],
  [-0.8, 0.85, -0.2],
  [1.2, 1.2, -0.35],
  [3.4, 1.65, -0.75],
  [5.7, 2.3, -1.15],
  [7.8, 3.1, -1.5],
  [9.6, 4.0, -1.9],
  [10.9, 4.9, -2.3],
];

export const curveOf = (pts: V3[], type: 'centripetal' | 'catmullrom' = 'centripetal'): CatmullRomCurve3 =>
  new CatmullRomCurve3(pts.map((p) => new Vector3(...p)), false, type);

export const sweepCurve = curveOf(SWEEP_PTS);
export const SWEEP_LEN = sweepCurve.getLength();
export const SWEEP_N = 120;
export const SWEEP_FR = makeFrames(sweepCurve, SWEEP_N, new Vector3(0, 1, 0));

/** Профиль по u (0 — шейка, 1 — кончик хвоста): плавная интерполяция между опорными точками. */
function profile(pts: [number, number][], u: number): number {
  if (u <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (u <= pts[i][0]) {
      const t = (u - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]);
      return lerp(pts[i - 1][1], pts[i][1], smoothstep(0, 1, t));
    }
  }
  return pts[pts.length - 1][1];
}

const A_PTS: [number, number][] = [[0, 1.0], [0.12, 1.02], [0.3, 1.12], [0.55, 1.02], [0.8, 0.82], [1, 0.6]];
const C_PTS: [number, number][] = [[0, 1.25], [0.12, 1.32], [0.3, 1.5], [0.55, 1.45], [0.8, 1.15], [1, 0.72]];
/** Половина толщины железы (спереди назад) и половина высоты в сечении на отметке u. */
export const halfAP = (u: number): number => profile(A_PTS, u);
export const halfH = (u: number): number => profile(C_PTS, u);

/** Границы отделов по u: шейка, тело, хвост. */
export const NECK_END = 0.13;
export const TAIL_START = 0.62;

/** Точка около железы в местной системе: u — вдоль, n — вверх, b — вперёд (b < 0 — позади железы). */
export function onGland(u: number, n: number, b: number): V3 {
  const o = { p: [0, 0, 0] as V3, t: [0, 0, 0] as V3, n: [0, 0, 0] as V3, b: [0, 0, 0] as V3 };
  frameAt(SWEEP_FR, Math.min(1, Math.max(0, u)), o);
  return [o.p[0] + o.n[0] * n + o.b[0] * b, o.p[1] + o.n[1] * n + o.b[1] * b, o.p[2] + o.n[2] * n + o.b[2] * b];
}

/** Отметка u, где ось железы ближе всего к заданному x. */
export function uAtX(x: number): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i <= SWEEP_N; i++) {
    const d = Math.abs(SWEEP_FR.P[i * 3] - x);
    if (d < bd) {
      bd = d;
      best = i / SWEEP_N;
    }
  }
  return best;
}

/* ---------- Форма железы ---------- */

export const HEAD = { c: [-4.6, -0.9, -0.45] as V3, r: [2.9, 3.95, 1.7] as V3, q: 2.6 };
/** Крючковидный отросток: ось (три точки) и радиусы; задняя часть тоньше (масштаб по z). */
export const UNCINATE = { pts: [[-4.2, -3.4, -1.6], [-2.4, -4.15, -2.55], [-0.5, -4.55, -3.05]] as V3[], r0: 0.95, r1: 0.6, zScale: 1.3 };
/** Сальниковый бугор — выступ тела вверх и вперёд у шейки. */
export const TUBER = { c: [1.8, 1.95, 0.35] as V3, r: 0.8 };

/* ---------- Протоки ---------- */

export const AMPULLA: V3 = [-7.5, -2.75, -1.72];
export const SPHINCTER: V3 = [-7.85, -2.75, -1.72];
export const MAJOR_PAPILLA: V3 = [-8.2, -2.75, -1.72];
export const MINOR_PAPILLA: V3 = [-8.2, -0.4, -1.0];

/** Главный проток: от хвоста вдоль оси железы к головке и к ампуле. */
export const MAIN_DUCT_PTS: V3[] = (() => {
  const pts: V3[] = [];
  for (let k = 0; k <= 9; k++) {
    const u = 0.97 - k * 0.1;
    pts.push(onGland(Math.max(0, u), -0.05, 0.02));
  }
  pts.push([-3.5, -0.15, -0.55], [-4.4, -1.2, -0.95], [-5.4, -2.1, -1.35], [-6.35, -2.65, -1.65], [-7.0, -2.75, -1.7]);
  return pts;
})();

export const ACCESSORY_DUCT_PTS: V3[] = [
  [-3.5, -0.15, -0.55],
  [-4.6, 0.2, -0.5],
  [-5.8, 0.15, -0.7],
  [-6.9, -0.2, -0.9],
  [-7.9, -0.38, -1.0],
];

/** Общий жёлчный проток: от слияния пузырного и печёночного к ампуле, внутри заднего края головки. */
export const BILE_DUCT_PTS: V3[] = [
  [-5.6, 7.2, -1.4],
  [-5.3, 4.8, -1.5],
  [-5.0, 2.5, -1.62],
  [-4.9, 0.3, -1.75],
  [-5.1, -1.6, -1.8],
  [-5.8, -2.6, -1.75],
  [-6.7, -2.75, -1.7],
  [-7.2, -2.75, -1.72],
];
export const CYSTIC_DUCT_PTS: V3[] = [[-6.7, 6.0, -0.4], [-6.3, 6.7, -0.9], [-5.6, 7.2, -1.4]];
export const HEPATIC_DUCT_PTS: V3[] = [[-6.6, 8.7, -1.5], [-5.9, 7.9, -1.5], [-5.6, 7.2, -1.4]];
export const GALLBLADDER_PTS: V3[] = [[-6.7, 6.0, -0.4], [-7.6, 4.4, 0.5], [-8.8, 2.6, 1.4], [-9.9, 0.9, 2.1]];

/* ---------- Сосуды ---------- */

export const AORTA_PTS: V3[] = [[1.4, -12, -5.4], [1.4, 0, -5.4], [1.4, 12.6, -5.4]];
export const IVC_PTS: V3[] = [[-2.7, -12, -5.0], [-2.7, 0, -5.0], [-2.7, 12.6, -5.0]];
export const CELIAC_PTS: V3[] = [[1.4, 4.6, -4.7], [1.4, 5.5, -3.5], [1.4, 5.85, -2.6]];
export const HEPATIC_ARTERY_PTS: V3[] = [
  [1.4, 5.85, -2.6],
  [-0.6, 6.25, -2.1],
  [-2.4, 5.7, -1.9],
  [-4.0, 6.8, -1.8],
  [-5.0, 8.0, -1.7],
];
export const GDA_PTS: V3[] = [[-2.4, 5.65, -1.9], [-3.2, 3.9, -1.0], [-3.0, 2.9, 0.5], [-3.6, 2.3, 1.3]];
export const PD_ARCADE_FRONT: V3[] = [[-3.6, 2.3, 1.3], [-5.6, 2.4, 1.45], [-7.0, 1.4, 0.9], [-7.15, -1.0, 0.3], [-6.9, -3.4, -0.4], [-5.9, -5.0, -1.2]];
export const PD_ARCADE_BACK: V3[] = [[-3.2, 3.6, -1.1], [-5.6, 2.6, -1.9], [-7.0, 0.8, -2.0], [-7.15, -1.8, -2.0], [-6.5, -4.2, -2.0], [-5.4, -5.2, -1.9]];
export const SMA_PTS: V3[] = [[1.4, 1.4, -4.6], [1.7, 0.4, -3.3], [1.9, -1.2, -2.6], [2.0, -4.0, -2.2], [2.2, -7.0, -1.6], [2.5, -10.0, -0.8]];
export const INF_PD_PTS: V3[] = [[2.0, -4.0, -2.2], [0.6, -4.9, -2.4], [-1.2, -5.6, -2.8], [-3.0, -5.9, -2.6], [-4.8, -5.6, -2.1]];
export const SMV_PTS: V3[] = [[0.6, -10.0, -0.6], [0.2, -7.0, -1.1], [-0.2, -4.0, -1.3], [-0.5, -1.6, -1.6], [-0.9, 0.4, -1.8]];
export const PORTAL_PTS: V3[] = [[-0.9, 0.4, -1.8], [-2.0, 1.8, -2.2], [-3.2, 3.6, -2.4], [-4.2, 5.6, -2.2], [-5.1, 7.6, -1.9]];
export const HILUM_ART: V3 = [11.7, 5.7, -3.3];
export const HILUM_VEIN: V3 = [11.7, 4.7, -3.3];

/** Селезёночная артерия: по верхнему краю железы извилистой лентой. */
export const SPLENIC_ARTERY_PTS: V3[] = (() => {
  const pts: V3[] = [[1.4, 5.85, -2.6], [2.3, 5.2, -2.1]];
  for (let k = 0; k < 9; k++) {
    const u = 0.14 + k * 0.095;
    pts.push(onGland(u, halfH(u) + 0.5 + 0.42 * Math.sin(k * 2.1), -0.35 + 0.35 * Math.cos(k * 1.7)));
  }
  pts.push(HILUM_ART);
  return pts;
})();

/** Селезёночная вена: сзади железы, от ворот селезёнки к слиянию с верхней брыжеечной веной. */
export const SPLENIC_VEIN_PTS: V3[] = (() => {
  const pts: V3[] = [[-0.9, 0.4, -1.8]];
  for (let k = 0; k < 9; k++) {
    const u = 0.06 + k * 0.11;
    pts.push(onGland(u, -0.25, -(halfAP(u) + 0.3)));
  }
  pts.push(HILUM_VEIN);
  return pts;
})();
export const SPLENIC_VEIN_TRIBUTARIES: V3[][] = [
  [[10.6, 4.6, -3.05], [11.4, 5.5, -3.5], [12.2, 6.1, -3.7]],
  [[10.6, 4.6, -3.05], [11.4, 3.9, -3.3], [12.2, 3.4, -3.3]],
];
export const IMV_PTS: V3[] = (() => {
  const u = uAtX(5.6);
  return [[7.6, -7.0, -1.0], [7.9, -3.5, -1.7], [7.2, -0.6, -2.0], [6.4, 1.0, -2.05], onGland(u, -0.25, -(halfAP(u) + 0.3))];
})();

/** Дорсальная поджелудочная артерия: от селезёночной вниз за шейкой, дальше вдоль нижнего края тела (поперечная). */
export const DORSAL_ARTERY_PTS: V3[] = (() => {
  const pts: V3[] = [onGland(0.16, halfH(0.16) + 0.5, -0.35), [0.6, 2.4, -1.3], [0.2, 0.4, -1.3], [-0.4, -1.6, -1.7]];
  return pts;
})();
export const DORSAL_BRANCH_RIGHT: V3[] = [[-0.4, -1.6, -1.7], [-2.2, -2.4, -1.8], [-3.8, -2.6, -1.7]];
export const TRANSVERSE_ARTERY_PTS: V3[] = (() => {
  const pts: V3[] = [[0.2, 0.4, -1.3]];
  for (let k = 0; k < 6; k++) {
    const u = 0.2 + k * 0.1;
    pts.push(onGland(u, -halfH(u) * 0.75, -halfAP(u) * 0.35));
  }
  return pts;
})();
export const GREAT_ARTERY_PTS: V3[] = (() => {
  const u = 0.52;
  return [onGland(u, halfH(u) + 0.5 + 0.42 * Math.sin(4 * 2.1), -0.35 + 0.35 * Math.cos(4 * 1.7)), onGland(u, halfH(u) * 0.55, -0.1), onGland(u, 0, 0.05)];
})();
export const GREAT_ARTERY_BRANCHES: V3[][] = [
  [onGland(0.52, 0, 0.05), onGland(0.42, -0.1, 0.08), onGland(0.32, -0.2, 0.05)],
  [onGland(0.52, 0, 0.05), onGland(0.62, 0.05, 0.05), onGland(0.74, 0.1, 0.0)],
];

/* ---------- Нервы, лимфоузлы ---------- */

export const GANGLIA: { c: V3; r: V3 }[] = [
  { c: [0.0, 5.0, -4.0], r: [0.95, 0.5, 0.45] },
  { c: [3.0, 5.3, -3.8], r: [0.9, 0.48, 0.45] },
];
export const NERVE_PATHS: V3[][] = [
  [[0.8, 5.0, -4.0], [1.6, 4.4, -4.1], [1.9, 3.0, -3.7], [2.0, 1.2, -3.5]],
  [[2.6, 5.4, -3.5], [3.5, 5.9, -2.6], [5.4, 6.1, -2.3], [7.6, 6.2, -2.6], [9.4, 6.9, -3.0]],
  [[0.3, 5.5, -3.2], [-0.8, 6.7, -2.4], [-2.6, 6.5, -2.2], [-4.2, 7.3, -2.0]],
  [[2.0, 1.2, -3.5], [1.4, 0.6, -2.8], [0.6, 0.3, -2.0], [0.2, 0.8, -0.9]],
  [[2.0, 1.2, -3.5], [0.4, -1.6, -2.7], [-1.6, -3.0, -2.4], [-3.4, -3.4, -2.2]],
  [[2.0, 1.2, -3.5], [3.6, 1.0, -2.6], [5.6, 1.4, -1.9], [7.8, 2.3, -2.2]],
];
export const LYMPH_NODES: { at: V3; r: V3 }[] = [
  { at: [3.0, 3.75, -1.5], r: [0.42, 0.3, 0.3] },
  { at: [6.4, 4.3, -2.2], r: [0.4, 0.28, 0.28] },
  { at: [9.2, 5.6, -3.0], r: [0.38, 0.28, 0.3] },
  { at: [-2.3, 4.3, -1.6], r: [0.42, 0.3, 0.3] },
  { at: [-5.8, 3.2, 0.9], r: [0.4, 0.3, 0.3] },
  { at: [-5.3, 1.0, -2.75], r: [0.36, 0.28, 0.3] },
  { at: [-3.0, -5.7, -1.6], r: [0.4, 0.3, 0.3] },
  { at: [-0.4, 3.3, 0.3], r: [0.34, 0.26, 0.28] },
];

/* ---------- Соседи ---------- */

/** Двенадцатиперстная кишка: подкова вокруг головки, затем горизонтальная часть и подъём к связке Трейтца. */
export const DUODENUM_PTS: V3[] = [
  [-3.2, 3.7, 2.5],
  [-5.4, 4.1, 1.7],
  [-7.4, 3.6, 0.4],
  [-8.9, 2.4, -0.9],
  [-9.3, 0.0, -1.55],
  [-9.2, -3.0, -1.8],
  [-8.8, -6.0, -1.9],
  [-8.0, -8.2, -2.2],
  [-5.8, -9.1, -2.7],
  [-3.0, -9.4, -3.1],
  [0.0, -9.4, -3.4],
  [2.6, -9.0, -3.3],
  [3.9, -7.4, -3.2],
  [4.1, -4.6, -3.0],
  [4.0, -2.2, -2.6],
  [4.2, -0.7, -2.0],
];
export const JEJUNUM_PTS: V3[] = [[4.2, -0.7, -2.0], [5.4, -2.2, -1.4], [7.0, -3.9, -0.4], [8.4, -5.8, 0.4]];
export const DUODENUM_R = 1.25;
export const duodenumCurve = curveOf(DUODENUM_PTS);
/** Границы четырёх частей двенадцатиперстной кишки по длине кривой (доли). */
export const DUODENUM_SPLIT = (() => {
  // верхняя часть — до верхнего изгиба; нисходящая — до нижнего; горизонтальная — до выхода вверх; восходящая — остаток
  const cum = [0];
  const pts = DUODENUM_PTS.map((p) => new Vector3(...p));
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const f = (i: number) => cum[i] / cum[cum.length - 1];
  return [f(3), f(7), f(11)] as [number, number, number];
})();

export const STOMACH_PTS: V3[] = [[5.5, 11.4, 1.8], [7.2, 8.2, 2.8], [6.6, 4.2, 3.8], [4.4, 0.6, 4.4], [1.6, -0.6, 4.2], [-1.2, 0.6, 3.5], [-3.0, 2.7, 2.7], [-3.2, 3.7, 2.5]];
export const STOMACH_R: [number, number][] = [[0, 2.0], [0.12, 2.9], [0.35, 3.1], [0.6, 2.8], [0.78, 2.2], [0.9, 1.7], [1, 1.3]];

export const SPLEEN = { c: [13.9, 5.2, -3.6] as V3, r: [2.1, 4.4, 2.9] as V3 };
export const L_KIDNEY = { c: [7.6, 0.6, -5.4] as V3, r: [2.5, 5.0, 2.3] as V3 };
export const R_KIDNEY = { c: [-8.8, -1.2, -5.4] as V3, r: [2.4, 4.8, 2.3] as V3 };
export const L_ADRENAL = { c: [4.6, 5.4, -4.6] as V3, r: [1.3, 0.85, 0.7] as V3 };
export const LIVER = { c: [-8.6, 10.6, -1.2] as V3, r: [6.2, 2.9, 4.4] as V3 };
export const SPINE_LEVELS = [8.0, 4.2, 0.4, -3.4, -7.2];
export const SPINE_C: V3 = [0, 0, -8.6];

/* ---------- Срезы ---------- */

/** Положение среза 0..1 -> координата плоскости. Срез убирает часть, обращённую к зрителю/к сверху/к левому боку пациента. */
export const CUT_RANGE = {
  side: { from: 3.2, to: -4.0 },
  fundus: { from: 8.0, to: -7.0 },
  coronal: { from: 14.0, to: -9.0 },
} as const;
export const CUT_DEFAULT_T = { side: 0.46, fundus: 0.5, coronal: 0.81 } as const;

export type CutKindP = keyof typeof CUT_RANGE;
export const cutCoord = (kind: CutKindP, t: number): number => lerp(CUT_RANGE[kind].from, CUT_RANGE[kind].to, t);

/** Плоскость среза (три вида): нормаль и константа так, что остаётся сторона с dot(n, p) + c >= 0. */
export function cutPlane(kind: CutKindP, t: number): { n: V3; c: number } {
  const v = cutCoord(kind, t);
  if (kind === 'side') return { n: [0, 0, -1], c: v };
  if (kind === 'fundus') return { n: [0, -1, 0], c: v };
  return { n: [-1, 0, 0], c: v };
}

/** Цикл «обед»: 0..1 — как сильно железа выделяет сок; период 36 с. */
export const MEAL_PERIOD = 36;
export function secretion(time: number): number {
  const t = time % MEAL_PERIOD;
  return smoothstep(7, 12, t) * (1 - smoothstep(24, 31, t));
}
