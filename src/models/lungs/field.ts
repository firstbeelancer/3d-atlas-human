/*
  Поля формы лёгких. Оси: +x — левая сторона человека (справа для зрителя), +y — вверх, +z — к зрителю.
  Единица длины — около 6 см. Правое лёгкое лежит при x < 0, левое — при x > 0.

  Каждое лёгкое — неявное тело: наклонённый эллипсоид (рёберная поверхность), срезанный средостенной
  плоскостью, куполом диафрагмы снизу и вдавленный соседями — сердцем, аортой, полой веной, пищеводом,
  позвоночником и подключичными сосудами. Доли — то же тело, разрезанное щелями.
*/

import { clamp, sdEllipsoid, sdPath, smax, smin, smoothstep, type V3 } from './sdf';

export type Side = -1 | 1;

/** Стороны: -1 — правое лёгкое, +1 — левое. */
export const RIGHT: Side = -1;
export const LEFT: Side = 1;

/* ---------- Соседние органы (опорные линии) ---------- */

export const AORTA_PATH: V3[] = [
  [-0.04, -0.55, 0.36], [-0.06, 0.1, 0.36], [0.0, 0.7, 0.28], [0.14, 1.12, 0.12], [0.38, 1.36, -0.06],
  [0.6, 1.26, -0.3], [0.7, 0.92, -0.55], [0.7, 0.3, -0.75], [0.64, -0.6, -0.84], [0.54, -1.6, -0.88], [0.48, -2.7, -0.9],
];
export const AORTA_R = 0.19;
/** Ветви дуги аорты: плечеголовной ствол и подключичные артерии (дают борозды на верхушках лёгких). */
export const ARCH_BRANCHES: { path: V3[]; r: number }[] = [
  { path: [[0.12, 1.2, 0.08], [-0.12, 1.6, 0.02], [-0.5, 2.0, 0.0]], r: 0.11 },
  { path: [[-0.5, 2.0, 0.3], [-0.85, 2.15, 0.5], [-1.3, 2.18, 0.58], [-1.75, 2.0, 0.55]], r: 0.08 },
  { path: [[0.46, 1.38, -0.12], [0.7, 1.85, 0.1], [1.02, 2.15, 0.45], [1.4, 2.0, 0.55]], r: 0.08 },
  { path: [[0.3, 1.34, 0.0], [0.28, 1.9, -0.02], [0.3, 2.8, -0.05]], r: 0.065 },
];
export const SVC_PATH: V3[] = [[-0.52, -0.62, 0.18], [-0.52, 0.2, 0.14], [-0.5, 1.0, 0.1], [-0.42, 1.55, 0.04], [-0.3, 1.95, 0.0]];
export const SVC_R = 0.15;
export const AZYGOS_PATH: V3[] = [[-0.5, -0.4, -0.78], [-0.5, 0.2, -0.76], [-0.55, 0.78, -0.62], [-0.58, 0.88, -0.2], [-0.52, 0.84, 0.1]];
export const AZYGOS_R = 0.065;
export const ESOPHAGUS_PATH: V3[] = [[0.0, 2.7, -0.5], [0.0, 1.6, -0.52], [0.07, 0.6, -0.56], [0.14, -0.7, -0.62], [0.3, -1.7, -0.56], [0.4, -2.2, -0.5]];
export const ESOPHAGUS_R = 0.115;
export const SPINE_PATH: V3[] = [[0, -3.3, -1.18], [0, 3.3, -1.18]];
export const SPINE_R = 0.52;
export const IVC_PATH: V3[] = [[-0.5, -1.2, -0.12], [-0.5, -0.6, 0.04], [-0.5, -0.1, 0.08]];
export const IVC_R = 0.16;

/* Сердце: наклонённый эллипсоид, верхушка смотрит влево, вниз и вперёд, плюс левое предсердие сзади. */
export const HEART = {
  c: [0.3, -0.72, 0.4] as V3,
  r: [1.38, 0.78, 0.9] as V3,
  atrium: { c: [0.12, -0.2, -0.28] as V3, r: [0.72, 0.36, 0.34] as V3 },
};
const HEART_L = (() => {
  const l: V3 = [0.56, -0.61, 0.56];
  const n = Math.hypot(...l);
  const L: V3 = [l[0] / n, l[1] / n, l[2] / n];
  const up: V3 = [0, 1, 0];
  const d = up[0] * L[0] + up[1] * L[1] + up[2] * L[2];
  let M: V3 = [up[0] - d * L[0], up[1] - d * L[1], up[2] - d * L[2]];
  const mn = Math.hypot(...M);
  M = [M[0] / mn, M[1] / mn, M[2] / mn];
  const N: V3 = [L[1] * M[2] - L[2] * M[1], L[2] * M[0] - L[0] * M[2], L[0] * M[1] - L[1] * M[0]];
  return { L, M, N };
})();

export function sdHeart(x: number, y: number, z: number): number {
  const px = x - HEART.c[0], py = y - HEART.c[1], pz = z - HEART.c[2];
  const { L, M, N } = HEART_L;
  const a = sdEllipsoid(px * L[0] + py * L[1] + pz * L[2], px * M[0] + py * M[1] + pz * M[2], px * N[0] + py * N[1] + pz * N[2], HEART.r[0], HEART.r[1], HEART.r[2]);
  const q = HEART.atrium;
  const b = sdEllipsoid(x - q.c[0], y - q.c[1], z - q.c[2], q.r[0], q.r[1], q.r[2]);
  return smin(a, b, 0.25);
}

/* ---------- Диафрагма ---------- */

/** Высота поверхности диафрагмы: два купола, правый выше левого, сзади она крепится ниже. */
export function diaphragmY(x: number, z: number): number {
  const r1 = ((x + 1.0) / 1.55) ** 2 + ((z + 0.05) / 1.7) ** 2;
  const r2 = ((x - 1.0) / 1.55) ** 2 + ((z + 0.1) / 1.7) ** 2;
  return smax(-1.0 - 1.2 * r1, -1.36 - 1.2 * r2, 0.35);
}

/** Контур грудной клетки на уровне диафрагмы: нормированный радиус. */
export function thoraxRho(x: number, z: number): number {
  return Math.hypot(x / 2.62, (z + 0.1) / 1.78);
}

/* ---------- Лёгкое ---------- */

interface Shape { uc: number; yc: number; zc: number; A: number; H: number; B: number }
const SHAPE: Record<Side, Shape> = {
  [-1]: { uc: 1.38, yc: -0.05, zc: -0.12, A: 1.16, H: 2.55, B: 1.4 },
  [1]: { uc: 1.32, yc: -0.1, zc: -0.15, A: 1.05, H: 2.6, B: 1.4 },
};

export interface FieldOpts {
  /** Рёберные борозды на рёберной поверхности. */
  ribs: boolean;
  /** Приподнять нижний край над рёберно-диафрагмальным синусом. */
  lift: boolean;
  /** Отступ основания над диафрагмой. */
  base: number;
}
export const LUNG_OPTS: FieldOpts = { ribs: true, lift: true, base: 0.07 };
export const SAC_OPTS: FieldOpts = { ribs: false, lift: false, base: 0.08 };

const HILUM_Y: Record<Side, number> = { [-1]: 0.46, [1]: 0.3 };

/** Поле лёгкого: < 0 внутри. Для плевры берут то же поле с другим уровнем (iso). */
export function lungField(s: Side, x: number, y: number, z: number, o: FieldOpts): number {
  const p = SHAPE[s];
  const u = s * x;
  const t = (y - p.yc) / p.H;
  const w = 1 - 0.2 * t;
  const uc = p.uc - 0.6 * smoothstep(0.15, 1, t);
  const zc = p.zc + 0.18 * Math.max(t, 0);
  const du = (u - uc) / (p.A * w);
  const dz = (z - zc) / (p.B * (1 - 0.1 * t));
  let d = (Math.sqrt(du * du + dz * dz + t * t) - 1) * 1.05;
  if (d > 0.5) return d;

  // средостенная плоскость
  d = smax(d, 0.3 - 0.08 * smoothstep(0.3, 1, t) - u, 0.14);

  // купол диафрагмы снизу; у рёбер край приподнят — рёберно-диафрагмальный синус
  let base = diaphragmY(x, z) + o.base;
  if (o.lift) base += 0.3 * smoothstep(0.55, 1.0, thoraxRho(x, z));
  d = smax(d, base - y, 0.08);

  // вдавления соседей
  d = smax(d, 0.06 - sdHeart(x, y, z), 0.24);
  d = smax(d, 0.02 - sdPath(x, y, z, ESOPHAGUS_PATH, ESOPHAGUS_R), 0.1);
  d = smax(d, 0.03 - sdPath(x, y, z, SPINE_PATH, SPINE_R), 0.22);
  if (s === LEFT) {
    d = smax(d, 0.02 - sdPath(x, y, z, AORTA_PATH, AORTA_R), 0.12);
    // сердечная вырезка на переднем крае; под ней остаётся язычок
    d = smax(d, -sdEllipsoid(x - 0.98, y + 0.5, z - 1.2, 0.78, 0.8, 0.82), 0.16);
  } else {
    d = smax(d, 0.02 - sdPath(x, y, z, SVC_PATH, SVC_R), 0.1);
    d = smax(d, 0.02 - sdPath(x, y, z, AZYGOS_PATH, AZYGOS_R), 0.06);
  }

  // ворота лёгкого: углубление на средостенной поверхности
  d = smax(d, -sdEllipsoid(x - s * 0.26, y - HILUM_Y[s], z + 0.2, 0.5, 0.56, 0.5), 0.1);

  // рёберные борозды
  if (o.ribs && d < 0.12) {
    const w2 = smoothstep(0.7, 1.5, u) * (1 - smoothstep(1.8, 2.4, Math.abs(y - 0.2)));
    d += 0.014 * Math.sin((y + 0.3 * z) * 13.6) * w2;
  }
  return d;
}

/* ---------- Щели и доли ---------- */

/** > 0 перед косой щелью (верхняя доля, язычок, средняя доля), < 0 позади (нижняя доля). */
export function fissureO(s: Side, x: number, y: number, z: number): number {
  const u = s * x;
  const y0 = (s === RIGHT ? 0.2 : 0.14) - 0.1 * (u - 1.0);
  return 0.6 * (y - y0) + 0.8 * (z + 0.05);
}

/** Горизонтальная щель справа: > 0 выше (верхняя доля), < 0 ниже (средняя доля). */
export function fissureH(x: number, y: number, z: number): number {
  void z;
  return y - (0.4 - 0.4 * (Math.abs(x) - 0.4) / 1.7);
}

export const LOBE_CODES = ['ru', 'rm', 'rl', 'lu', 'll'] as const;
export type LobeCode = (typeof LOBE_CODES)[number];
export const LOBE_PART: Record<LobeCode, string> = {
  ru: 'upper-lobe-right',
  rm: 'middle-lobe',
  rl: 'lower-lobe-right',
  lu: 'upper-lobe-left',
  ll: 'lower-lobe-left',
};

const GAP = 0.012;
const KR = 0.05;

/** Поле одной доли: тело лёгкого, обрезанное щелями с зазором и скруглением, чтобы щели были видны. */
export function lobeField(lobe: LobeCode, F: number, fo: number, fh: number): number {
  switch (lobe) {
    case 'ru': return smax(smax(F, GAP - fo, KR), GAP - fh, KR);
    case 'rm': return smax(smax(F, GAP - fo, KR), GAP + fh, KR);
    case 'rl': return smax(F, GAP + fo, KR);
    case 'lu': return smax(F, GAP - fo, KR);
    case 'll': return smax(F, GAP + fo, KR);
  }
}

/** Доля в точке и расстояние до её поверхности (для разрезов и посадки бронхиального дерева). */
export function lobeAt(x: number, y: number, z: number): { lobe: LobeCode | null; d: number } {
  const s: Side = x < 0 ? RIGHT : LEFT;
  const F = lungField(s, x, y, z, LUNG_OPTS);
  if (F > 0.3) return { lobe: null, d: F };
  const fo = fissureO(s, x, y, z);
  const fh = fissureH(x, y, z);
  const ids: LobeCode[] = s === RIGHT ? ['ru', 'rm', 'rl'] : ['lu', 'll'];
  let best = 1e9;
  let bl: LobeCode = ids[0];
  for (const id of ids) {
    const v = lobeField(id, F, fo, fh);
    if (v < best) {
      best = v;
      bl = id;
    }
  }
  return { lobe: best < 0 ? bl : null, d: best };
}

/** Границы поиска для каждого лёгкого. */
export const LUNG_BOX: Record<Side, { min: V3; max: V3 }> = {
  [-1]: { min: [-2.75, -2.7, -1.75], max: [-0.1, 2.75, 1.65] },
  [1]: { min: [0.1, -2.9, -1.75], max: [2.7, 2.75, 1.65] },
};

export { clamp };
