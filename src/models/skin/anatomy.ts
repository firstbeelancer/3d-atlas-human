import { curveOf, fbm, lerp, smooth, type V3 } from './geometry';

/*
  Кожа — блок кожного покрова (условные единицы, масштаб подобран для обзора):
  поверхность y = 0, эпидермис из пяти слоёв, дерма из двух, гиподерма с жировыми дольками.
  В блоке живут косой волосяной фолликул, сальные и потовые железы, мышца, поднимающая волос,
  сосудистые сплетения, лимфатические капилляры, нервные сплетения и все кожные рецепторы.
*/

export type CutKind = 'side' | 'fundus' | 'coronal';

export const CUT_DEFAULT_T: Record<CutKind, number> = { side: 0.5, fundus: 0.5, coronal: 0.5 };

/** Границы слоёв по y (поверхность = 0) и размеры блока. */
export const SK = {
  x0: -10,
  x1: 10,
  hz: 6,
  corneum: -0.18,
  lucidum: -0.28,
  granulosum: -0.42,
  papillary: -2.4,
  reticular: -6.4,
  bottom: -10.6,
};

/* ------------------------------- Поверхность ------------------------------- */

/** Борозды и гребни микрорельефа: ромбическая сетка линий Лангера. */
const groove = (x: number, z: number): number =>
  Math.abs(Math.sin(x * 1.9 + z * 1.15)) * Math.abs(Math.sin(x * 1.15 - z * 1.9));

/** Воронка устья фолликула (остиум). */
export const folliclePore = (x: number, z: number): number => {
  const d2 = (x - 4.2) ** 2 + z ** 2;
  return -0.27 * Math.exp(-d2 / 0.75);
};

/** Воронки пор потовых желёз. */
export const sweatPores: V3[] = [
  [-5.2, 0, 0.45],
  [-8.3, 0, -2.8],
];
const sweatPoreDip = (x: number, z: number): number => {
  let s = 0;
  for (const p of sweatPores) s += -0.12 * Math.exp(-((x - p[0]) ** 2 + (z - p[2]) ** 2) / 0.16);
  return s;
};

/** Верхняя поверхность кожи: микрорельеф + воронки устья и пор. */
export const reliefTop = (x: number, z: number): number =>
  0.05 * (fbm(x * 2.3, 0, z * 2.3, 3) - 0.5) + 0.028 * groove(x, z) + folliclePore(x, z) + sweatPoreDip(x, z);

/** Дермальные сосочки: волнистая граница эпидермиса и дермы. */
const ridge = (x: number, z: number): number =>
  (0.5 + 0.5 * Math.sin(x * 2.5 + 0.4 * Math.cos(z * 1.3))) *
  (0.5 + 0.5 * Math.sin(z * 2.2 + 1.0 + 0.35 * Math.sin(x * 1.6))) *
  (0.82 + 0.36 * fbm(x * 0.9, 0, z * 0.9, 2));

/** Нижняя граница эпидермиса (базальная мембрана) с гребнями и воронками. */
export const epiBase = (x: number, z: number): number =>
  -0.95 - 0.34 * ridge(x, z) + (folliclePore(x, z) + sweatPoreDip(x, z)) * 0.45;

/* -------------------------------- Фолликул -------------------------------- */

/** Ось фолликула от устья до дна луковицы (в плоскости z = 0, косо вниз и к -x). */
export const AX_PTS: V3[] = [
  [4.2, 0, 0],
  [3.72, -1.35, 0],
  [3.2, -2.9, 0],
  [2.66, -4.55, 0],
  [2.2, -6.1, 0],
  [1.9, -7.3, 0],
  [1.78, -8.05, 0],
];
export const AX = curveOf(AX_PTS);
export const axisAt = (u: number): V3 => {
  const p = AX.getPoint(Math.min(1, Math.max(0, u)));
  return [p.x, p.y, p.z];
};
export const axisDir = (u: number): V3 => {
  const t = AX.getTangent(Math.min(1, Math.max(0, u)));
  return [t.x, t.y, t.z];
};

/** Точка на расстоянии rad от оси в плоскости, повёрнутой на угол phi вокруг оси. */
export function around(u: number, rad: number, phi: number): V3 {
  const p = AX.getPoint(u);
  const t = AX.getTangent(u);
  const bx = -t.y;
  const by = t.x;
  const l = Math.hypot(bx, by) || 1;
  return [p.x + (rad * Math.cos(phi) * bx) / l, p.y + (rad * Math.cos(phi) * by) / l, p.z + rad * Math.sin(phi)];
}

/** Стержень над кожей: уходит вверх и ложится дугой. */
export const HAIR_UP_PTS: V3[] = [
  [4.2, 0, 0],
  [4.6, 1.35, 0],
  [5.5, 2.75, 0],
  [7.1, 3.95, 0],
  [9.2, 4.55, 0],
  [11.4, 4.25, 0],
  [13.1, 3.3, 0],
];
export const HAIR_UP = curveOf(HAIR_UP_PTS);

const bulbK = (u: number) => smooth(0.78, 0.96, u);
const funnel = (u: number) => (u < 0.16 ? (1 - u / 0.16) ** 2 : 0);

/** Наружные радиусы слоёв фолликула как функции положения вдоль оси (0 — устье, 1 — дно). */
export const R = {
  ct: (u: number) => 0.94 + 0.66 * bulbK(u) + 0.9 * funnel(u),
  glassy: (u: number) => R.ct(u) - 0.09,
  ors: (u: number) => R.ct(u) - 0.13,
  irs: (u: number) => 0.44 + 0.34 * bulbK(u),
  root: () => 0.27,
  cortex: () => 0.21,
  medulla: () => 0.07,
  bulb: (u: number) => 0.56 + 0.78 * bulbK(u),
  matrix: (u: number) => 0.4 + 0.62 * bulbK(u),
};

/** Ключевые положения вдоль оси. */
export const U = {
  duct: 0.13,
  irsStart: 0.26,
  bulge: 0.42,
  rootEnd: 0.88,
  irsEnd: 0.9,
};

/** Волосяной сосочек у дна луковицы. */
export const PAPILLA: { c: V3; r: V3 } = { c: [1.78, -8.3, 0], r: [0.52, 0.82, 0.52] };

/** Мышца, поднимающая волос: от выпуклости фолликула к сосочковому слою. */
export const ARRECTOR = {
  from: (() => {
    const p = axisAt(U.bulge);
    return [p[0] - 0.95, p[1], 0] as V3;
  })(),
  to: [-2.7, -1.45, 0] as V3,
};

/** Точка вращения фолликула при «мурашках» — устье на поверхности. */
export const PIVOT: V3 = [4.2, 0, 0];
export const GOOSE_ANGLE = 0.3;

/* --------------------------- Железы и рецепторы --------------------------- */

/** Клубочки эккриновых потовых желёз и их поры. */
export const ECCRINE: { c: V3; k: number }[] = [
  { c: [-5.2, -7.7, 0.5], k: 1 },
  { c: [-8.3, -7.3, -2.8], k: 0.8 },
];

/** Апокриновая железа: клубок и проток к воронке фолликула. */
export const APOCRINE = { c: [7.5, -6.8, -1.8] as V3, ductTo: [4.55, -0.55, -0.15] as V3 };

/** Тельца Мейснера в дермальных сосочках (x, z). */
export const MEISSNER_SPOTS: [number, number][] = [
  [-7.6, 0.9],
  [-3.1, -0.7],
  [0.6, 2.3],
  [6.9, 1.4],
  [8.7, -2.2],
];

/** Тельца Пачини в глубокой дерме и гиподерме. */
export const PACINIAN_SPOTS: V3[] = [
  [-1.6, -8.8, 2.0],
  [8.7, -9.0, -3.4],
];

/** Окончания Руффини в сетчатой дерме. */
export const RUFFINI_SPOTS: V3[] = [
  [-6.5, -4.3, -1.6],
  [5.6, -4.7, 2.5],
  [0.8, -5.3, -3.3],
];

/** Клетки Меркеля у базальной мембраны (x, z). */
export const MERKEL_SPOTS: [number, number][] = [
  [5.2, -0.3],
  [6.1, 0.5],
  [-1.3, -0.4],
  [-3.2, 1.0],
  [-5.9, -0.8],
  [7.9, 0.7],
  [0.9, -0.9],
];

/** Меланоциты базального слоя (x, z). */
export const MELANOCYTE_SPOTS: [number, number][] = [
  [-8.5, 0.1],
  [-5.5, -0.2],
  [-2.2, 0.3],
  [0.9, 0.1],
  [6.3, -0.2],
  [8.9, 0.2],
];

/** Клетки Лангерганса в шиповатом слое (x, z). */
export const LANGERHANS_SPOTS: [number, number][] = [
  [-6.8, 0.2],
  [-0.5, -0.1],
  [7.4, 0.3],
];

/* --------------------------------- Сечения -------------------------------- */

export function cutPlane(kind: CutKind, t: number): { n: V3; c: number } {
  if (kind === 'side') return { n: [0, 0, -1], c: SK.hz * (1 - 2 * t) };
  if (kind === 'fundus') return { n: [-1, 0, 0], c: lerp(SK.x1 + 1.5, SK.x0 - 1.5, t) };
  return { n: [0, -1, 0], c: lerp(0.6, SK.bottom, t) };
}

export const v3 = (x: number, y: number, z: number): V3 => [x, y, z];
