import { mulberry32 } from '../gallbladder/geometry';
import { curveOf, type V3 } from './anatomy';

/*
  Селезёнка «под микроскопом» (сильно увеличена). Слева — капсула с трабекулой и белая пульпа: центральная артерия
  в муфте из Т-лимфоцитов (PALS), фолликул из В-лимфоцитов с зародышевым центром и краевая зона. Справа — красная пульпа:
  пенициллярные артериолы с эллипсоидами, селезёночные тяжи Бильрота с макрофагами и плазматическими клетками,
  венозные синусы из «береговых» клеток с кольцевыми волокнами (как обручи на бочке) и пульпарная вена.
  Старые эритроциты не протискиваются в щели между клетками синуса и достаются макрофагам.
*/

export interface Ball {
  p: V3;
  r: number;
  tint: number;
}
export interface Ell {
  p: V3;
  dir: V3;
  rl: number;
  rs: number;
  tint: number;
}

export const CAPSULE = { x0: -12.6, x1: 12.6, y0: 6.5, y1: 7.5, z0: -3, z1: 3 };
export const TRABECULA = { x0: -10.5, x1: -8.9, y0: -7.6, y1: 6.5, z0: -2.3, z1: 2.3 };
export const TRAB_ARTERY: V3[] = [[-9.7, 6.4, 0.75], [-9.75, 3.0, 0.72], [-9.7, 0.4, 0.75], [-9.7, -3.0, 0.72], [-9.7, -6.6, 0.75]];
export const TRAB_VEIN: V3[] = [[-9.7, 6.0, -0.75], [-9.7, 2.5, -0.78], [-9.7, -1.5, -0.74], [-9.7, -5.0, -0.78], [-9.7, -6.9, -0.74]];

/** Центральная артерия: ответвляется от трабекулярной и проходит через белую пульпу. */
export const CENTRAL_PTS: V3[] = [
  [-9.7, 1.1, 0.75],
  [-8.5, 1.3, 0.62],
  [-7.1, 1.05, 0.38],
  [-5.5, 0.72, 0.2],
  [-3.9, 0.5, 0.06],
  [-2.4, 0.32, -0.04],
  [-1.0, 0.2, -0.1],
  [0.3, 0.1, 0],
];
export const PALS = { a: [-7.3, 1.0, 0.36] as V3, b: [-0.9, 0.2, -0.1] as V3, r: 1.35 };
export const FOLLICLE = { c: [-3.9, 2.7, 0.15] as V3, r: 1.9 };
export const GERM = { c: [-3.9, 2.9, 0.2] as V3, r: 1.0 };
export const MARGINAL = { c: [-4.0, 1.6, 0.1] as V3, r: [4.7, 3.9, 2.7] as V3 };

/** Пенициллярные артериолы: три «кисточки» из конца центральной артерии, у каждой на конце эллипсоид. */
export const PENICILLAR: V3[][] = [
  [[0.3, 0.1, 0], [1.4, 0.7, 0.4], [2.5, 1.4, 0.8], [3.3, 1.8, 0.85]],
  [[0.3, 0.1, 0], [1.6, -0.05, -0.1], [2.8, -0.35, -0.5], [3.7, -0.5, -0.6]],
  [[0.3, 0.1, 0], [1.3, -0.9, 0.2], [2.2, -2.0, 0.5], [3.0, -2.7, 0.6]],
];
export const ELLIPSOIDS: { c: V3; dir: V3 }[] = [
  { c: [3.9, 2.05, 0.85], dir: [0.7, 0.4, 0.05] },
  { c: [4.3, -0.55, -0.6], dir: [0.95, -0.1, -0.1] },
  { c: [3.6, -3.0, 0.6], dir: [0.7, -0.5, 0.05] },
];

/** Венозные синусы: три трубки, сходящиеся к пульпарной вене внизу. */
export const SINUS_R = 0.95;
export const SINUSES: V3[][] = [
  [[4.6, 5.0, -0.8], [5.4, 1.5, -0.5], [6.6, -2.2, -0.2], [8.2, -5.5, 0]],
  [[8.4, 5.4, 0.8], [8.0, 2.0, 0.6], [8.2, -1.8, 0.3], [8.8, -5.3, 0.1]],
  [[11.3, 4.2, -0.4], [10.9, 0.6, -0.1], [10.3, -3.0, 0], [9.6, -5.6, 0]],
];
export const PULP_VEIN: V3[] = [[9.3, -6.2, 0], [7.0, -6.7, 0], [3.0, -6.9, 0], [-2.0, -6.9, 0.1], [-6.5, -6.9, -0.4], [-9.7, -6.8, -0.74]];
/** Путь эритроцитов от эллипсоида через тяж к щели синуса. */
export const CORD_PATHS: V3[][] = [
  [[4.5, 2.2, 0.85], [5.0, 2.7, 0.2], [5.45, 2.4, -0.3]],
  [[5.0, -0.6, -0.6], [5.6, -0.7, -0.4], [6.3, -0.95, -0.25]],
  [[4.0, -3.35, 0.6], [4.8, -3.9, 0.3], [6.9, -3.35, -0.05]],
];

export const ANCHORS: Record<string, V3> = {
  'm-capsule': [-4.0, 7.0, 1.6],
  'm-trabecula': [-9.7, -3.7, 1.6],
  'm-trab-artery': [-9.7, 3.7, 0.9],
  'm-trab-vein': [-9.7, -5.4, -0.8],
  'm-central-artery': [-6.2, 0.9, 0.4],
  'm-pals': [-5.2, -0.6, 1.3],
  'm-follicle': [-2.4, 3.9, 1.3],
  'm-germinal': [-4.0, 3.3, 0.9],
  'm-marginal-zone': [-7.3, 3.5, 1.2],
  'm-penicillar': [1.6, 0.5, 0.4],
  'm-ellipsoid': [3.9, 2.05, 1.4],
  'm-cords': [11.0, 6.3, 0.4],
  'm-macrophage': [5.2, 4.1, 1.6],
  'm-plasma': [9.3, -1.9, 1.4],
  'm-sinus': [6.6, -2.2, 0.9],
  'm-littoral': [8.2, 1.2, 1.5],
  'm-annular': [10.3, -3.0, 1.1],
  'm-rbc': [5.0, 5.9, 0.3],
  'm-old-rbc': [3.4, -4.6, 1.1],
  'm-pulp-vein': [-1.0, -6.9, 0.7],
};

type Rand = () => number;
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const distToPath = (p: V3, pts: V3[]): number => {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const ab = sub(b, a);
    const ap = sub(p, a);
    const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (len(ab) ** 2 || 1)));
    best = Math.min(best, len([ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t]));
  }
  return best;
};
/** Расстояние до плотно размеченной кривой (CatmullRom) — для расталкивания клеток от сосудов. */
const sampled = (pts: V3[], n = 40): V3[] => {
  const c = curveOf(pts);
  return Array.from({ length: n + 1 }, (_, i) => {
    const p = c.getPointAt(i / n);
    return [p.x, p.y, p.z] as V3;
  });
};

const CENTRAL_S = sampled(CENTRAL_PTS, 60);
const SINUS_S = SINUSES.map((s) => sampled(s, 40));
const PENI_S = PENICILLAR.map((s) => sampled(s, 12));
const PULP_S = sampled(PULP_VEIN, 50);

const unit = (rand: Rand): V3 => {
  const z = rand() * 2 - 1;
  const a = rand() * Math.PI * 2;
  const s = Math.sqrt(1 - z * z);
  return [s * Math.cos(a), s * Math.sin(a), z];
};

export interface MicroData {
  anchors: Record<string, V3>;
  tCells: Ball[];
  bMantle: Ball[];
  germ: Ball[];
  tingible: Ball[];
  mzCells: Ball[];
  mzMacro: Ball[];
  macros: Ball[];
  macroInclusions: Ball[];
  plasma: Ell[];
  rbcCords: Ell[];
  oldRbc: Ell[];
  reticular: V3[][];
  staves: { a: V3; b: V3 }[];
  hoops: { c: V3; t: V3; R: number }[];
  capsuleNuclei: Ell[];
  trabNuclei: Ell[];
}

export function buildMicroData(): MicroData {
  const rand = mulberry32(2718);
  const pick = (a: number, b: number) => a + (b - a) * rand();

  // Т-клетки: цилиндр вокруг центральной артерии (кроме фолликула)
  const axis = sub(PALS.b, PALS.a);
  const axisLen = len(axis);
  const ax: V3 = [axis[0] / axisLen, axis[1] / axisLen, axis[2] / axisLen];
  const tCells: Ball[] = [];
  let guard = 0;
  while (tCells.length < 280 && guard++ < 20000) {
    const t = rand();
    const base: V3 = [PALS.a[0] + axis[0] * t, PALS.a[1] + axis[1] * t, PALS.a[2] + axis[2] * t];
    const u = unit(rand);
    const k = Math.cbrt(rand()) * PALS.r;
    const p: V3 = [base[0] + u[0] * k, base[1] + u[1] * k, base[2] + u[2] * k];
    const rad = Math.hypot(p[0] - base[0], p[1] - base[1], p[2] - base[2]);
    const dc = distToPath(p, CENTRAL_S);
    const df = len(sub(p, FOLLICLE.c));
    if (rad > PALS.r || dc < 0.42 || df < FOLLICLE.r + 0.12) continue;
    void ax;
    tCells.push({ p, r: 0.15, tint: rand() });
  }

  // В-клетки мантии: оболочка фолликула вокруг зародышевого центра
  const bMantle: Ball[] = [];
  guard = 0;
  while (bMantle.length < 240 && guard++ < 20000) {
    const u = unit(rand);
    const k = pick(GERM.r + 0.25, FOLLICLE.r - 0.05);
    const p: V3 = [FOLLICLE.c[0] + u[0] * k, FOLLICLE.c[1] + u[1] * k, FOLLICLE.c[2] + u[2] * k];
    bMantle.push({ p, r: 0.15, tint: rand() });
  }
  // зародышевый центр: крупные бледные клетки и макрофаги с «телами» (поглощёнными фрагментами)
  const germ: Ball[] = [];
  guard = 0;
  while (germ.length < 64 && guard++ < 5000) {
    const u = unit(rand);
    const k = Math.cbrt(rand()) * (GERM.r - 0.22);
    germ.push({ p: [GERM.c[0] + u[0] * k, GERM.c[1] + u[1] * k, GERM.c[2] + u[2] * k], r: 0.22, tint: rand() });
  }
  const tingible: Ball[] = [
    { p: [GERM.c[0] - 0.35, GERM.c[1] + 0.15, GERM.c[2] + 0.35], r: 0.36, tint: 0.3 },
    { p: [GERM.c[0] + 0.4, GERM.c[1] - 0.25, GERM.c[2] - 0.2], r: 0.34, tint: 0.6 },
    { p: [GERM.c[0] + 0.05, GERM.c[1] + 0.5, GERM.c[2] - 0.45], r: 0.32, tint: 0.8 },
  ];

  // краевая зона: оболочка вокруг всей узелка
  const mzCells: Ball[] = [];
  guard = 0;
  const inMz = (p: V3) =>
    Math.sqrt(((p[0] - MARGINAL.c[0]) / MARGINAL.r[0]) ** 2 + ((p[1] - MARGINAL.c[1]) / MARGINAL.r[1]) ** 2 + ((p[2] - MARGINAL.c[2]) / MARGINAL.r[2]) ** 2);
  while (mzCells.length < 190 && guard++ < 30000) {
    const u = unit(rand);
    const k = pick(0.8, 0.97);
    const p: V3 = [MARGINAL.c[0] + u[0] * MARGINAL.r[0] * k, MARGINAL.c[1] + u[1] * MARGINAL.r[1] * k, MARGINAL.c[2] + u[2] * MARGINAL.r[2] * k];
    const df = len(sub(p, FOLLICLE.c));
    if (df < FOLLICLE.r + 0.1 || inMz(p) > 1) continue;
    if (p[0] < -8.4 || p[0] > 0.9) continue;
    if (distToPath(p, CENTRAL_S) < 0.5) continue;
    mzCells.push({ p, r: 0.19, tint: rand() });
  }
  const mzMacro: Ball[] = [];
  guard = 0;
  while (mzMacro.length < 8 && guard++ < 5000) {
    const u = unit(rand);
    const p: V3 = [MARGINAL.c[0] + u[0] * MARGINAL.r[0] * 0.92, MARGINAL.c[1] + u[1] * MARGINAL.r[1] * 0.92, MARGINAL.c[2] + u[2] * MARGINAL.r[2] * 0.92];
    if (p[0] < -8 || p[0] > 0.2 || len(sub(p, FOLLICLE.c)) < FOLLICLE.r + 0.3) continue;
    mzMacro.push({ p, r: 0.42, tint: rand() });
  }

  // красная пульпа: тяжи
  const inCords = (p: V3, margin: number): boolean => {
    if (SINUS_S.some((s) => distToPath(p, s) < SINUS_R + margin)) return false;
    if (PENI_S.some((s) => distToPath(p, s) < 0.35 + margin * 0.4)) return false;
    if (ELLIPSOIDS.some((e) => len(sub(p, e.c)) < 1.15 + margin * 0.5)) return false;
    if (distToPath(p, PULP_S) < 0.75 + margin) return false;
    return true;
  };
  const inBox = (): V3 => [pick(1.6, 12.0), pick(-6.0, 5.8), pick(-2.4, 2.4)];

  const macros: Ball[] = [];
  const macroInclusions: Ball[] = [];
  guard = 0;
  const fixedMacro: V3[] = [[5.3, 4.0, 1.0], [5.9, -0.9, 1.15], [3.3, -4.4, 0.9], [9.6, 3.9, 0.4], [9.3, -1.9, -0.3]];
  for (const p of fixedMacro) macros.push({ p, r: 0.6, tint: rand() });
  while (macros.length < 14 && guard++ < 10000) {
    const p = inBox();
    if (!inCords(p, 0.8)) continue;
    if (macros.some((m) => len(sub(m.p, p)) < 1.8)) continue;
    macros.push({ p, r: pick(0.5, 0.62), tint: rand() });
  }
  for (const m of macros) {
    const n = 2 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const u = unit(rand);
      const k = m.r * 0.5;
      macroInclusions.push({ p: [m.p[0] + u[0] * k, m.p[1] + u[1] * k, m.p[2] + u[2] * k], r: 0.17, tint: rand() });
    }
  }

  const plasma: Ell[] = [];
  guard = 0;
  while (plasma.length < 26 && guard++ < 10000) {
    const p = inBox();
    if (!inCords(p, 0.45) || macros.some((m) => len(sub(m.p, p)) < m.r + 0.35)) continue;
    const u = unit(rand);
    plasma.push({ p, dir: u, rl: 0.3, rs: 0.24, tint: rand() });
  }

  const rbcCords: Ell[] = [];
  guard = 0;
  while (rbcCords.length < 340 && guard++ < 40000) {
    const p = inBox();
    if (!inCords(p, 0.12)) continue;
    if (macros.some((m) => len(sub(m.p, p)) < m.r + 0.12)) continue;
    rbcCords.push({ p, dir: unit(rand), rl: 0.2, rs: 0.07, tint: rand() });
  }
  // старые эритроциты: шарообразные, у макрофагов и у щелей синуса — их не пропускают
  const oldRbc: Ell[] = [];
  for (const m of macros.slice(0, 5)) {
    for (let i = 0; i < 3; i++) {
      const u = unit(rand);
      const k = m.r + 0.16 + rand() * 0.12;
      oldRbc.push({ p: [m.p[0] + u[0] * k, m.p[1] + u[1] * k, m.p[2] + u[2] * k], dir: u, rl: 0.17, rs: 0.14, tint: rand() });
    }
  }
  for (const s of [SINUS_S[0], SINUS_S[1]]) {
    for (let i = 0; i < 4; i++) {
      const q = s[8 + i * 7];
      const nxt = s[9 + i * 7];
      const dir = sub(nxt, q);
      const out: V3 = [dir[1], -dir[0], 0];
      const l = len(out) || 1;
      const k = SINUS_R + 0.3;
      oldRbc.push({ p: [q[0] + (out[0] / l) * k, q[1] + (out[1] / l) * k, q[2] + 0.1], dir: unit(rand), rl: 0.17, rs: 0.14, tint: rand() });
    }
  }

  // ретикулярные волокна: тонкая сеть между случайными точками тяжа
  const reticular: V3[][] = [];
  guard = 0;
  while (reticular.length < 110 && guard++ < 20000) {
    const a = inBox();
    if (!inCords(a, 0.2)) continue;
    const u = unit(rand);
    const l = pick(0.9, 1.9);
    const b: V3 = [a[0] + u[0] * l, a[1] + u[1] * l, a[2] + u[2] * l * 0.6];
    if (!inCords(b, 0.2)) continue;
    reticular.push([a, [(a[0] + b[0]) / 2 + (rand() - 0.5) * 0.25, (a[1] + b[1]) / 2 + (rand() - 0.5) * 0.25, (a[2] + b[2]) / 2], b]);
  }

  // стенка синусов: палочковидные «береговые» клетки по окружности и кольца-«обручи»
  const staves: { a: V3; b: V3 }[] = [];
  const hoops: { c: V3; t: V3; R: number }[] = [];
  SINUSES.forEach((pts) => {
    const curve = curveOf(pts);
    const N = 6;
    const frames = curve.computeFrenetFrames(N, false);
    const M = 24;
    for (let seg = 0; seg < N; seg++) {
      const pa = curve.getPointAt(seg / N);
      const pb = curve.getPointAt((seg + 1) / N);
      const na = frames.normals[seg];
      const nb = frames.normals[seg + 1];
      const ba = frames.binormals[seg];
      const bb = frames.binormals[seg + 1];
      for (let i = 0; i < M; i++) {
        const ang = (i / M) * Math.PI * 2 + (seg % 2 ? 0.02 : 0);
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        const a: V3 = [pa.x + (na.x * ca + ba.x * sa) * SINUS_R, pa.y + (na.y * ca + ba.y * sa) * SINUS_R, pa.z + (na.z * ca + ba.z * sa) * SINUS_R];
        const b: V3 = [pb.x + (nb.x * ca + bb.x * sa) * SINUS_R, pb.y + (nb.y * ca + bb.y * sa) * SINUS_R, pb.z + (nb.z * ca + bb.z * sa) * SINUS_R];
        staves.push({ a, b });
      }
    }
    for (let k = 1; k < 10; k++) {
      const t = k / 10;
      const c = curve.getPointAt(t);
      const tan = curve.getTangentAt(t);
      hoops.push({ c: [c.x, c.y, c.z], t: [tan.x, tan.y, tan.z], R: SINUS_R + 0.04 });
    }
  });

  // ядра клеток капсулы и трабекулы
  const capsuleNuclei: Ell[] = [];
  for (let i = 0; i < 26; i++) {
    capsuleNuclei.push({ p: [pick(CAPSULE.x0 + 0.5, CAPSULE.x1 - 0.5), pick(CAPSULE.y0 + 0.25, CAPSULE.y1 - 0.25), pick(-2.4, 2.4)], dir: [1, 0, 0], rl: 0.42, rs: 0.07, tint: rand() });
  }
  const trabNuclei: Ell[] = [];
  for (let i = 0; i < 22; i++) {
    trabNuclei.push({ p: [pick(TRABECULA.x0 + 0.2, TRABECULA.x1 - 0.2), pick(-7, 6), pick(-2.0, 2.0)], dir: [0, 1, 0], rl: 0.4, rs: 0.07, tint: rand() });
  }

  return { anchors: ANCHORS, tCells, bMantle, germ, tingible, mzCells, mzMacro, macros, macroInclusions, plasma, rbcCords, oldRbc, reticular, staves, hoops, capsuleNuclei, trabNuclei };
}
