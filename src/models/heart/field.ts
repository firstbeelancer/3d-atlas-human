/*
  Поле расстояний сердца. Работает без three.js (считается в фоновом потоке).

  Камеры, сосуды и мышцы заданы неявными телами. «Сердечная» система координат H = (s, lat, ant):
  s — вдоль длинной оси от основания к верхушке, lat — к левому боку человека, ant — вперёд (к грудине).
  Мировая система: +x — левая сторона человека (справа для зрителя), +y — вверх, +z — к зрителю.
  Единица длины ≈ 4 см: длина сердца около 3 единиц, диаметр аорты около 0,6.
*/

import { clamp, cross, dot, norm, scale, sdEllipsoid, smax, smin, sub, type V3 } from '../lungs/sdf';

/* ---------- система координат сердца ---------- */

/** Длинная ось: от основания к верхушке (вниз, влево, вперёд). */
export const AX: V3 = norm([0.34, -0.88, 0.33]);
const X_HAT: V3 = [1, 0, 0];
export const LAT: V3 = norm(sub(X_HAT, scale(AX, dot(X_HAT, AX))));
export const ANT: V3 = cross(AX, LAT);
/** Центр основания (плоскость клапанов). */
export const BASE: V3 = [-0.05, 0.45, -0.15];

export function hw(s: number, lat: number, ant: number): V3 {
  return [
    BASE[0] + s * AX[0] + lat * LAT[0] + ant * ANT[0],
    BASE[1] + s * AX[1] + lat * LAT[1] + ant * ANT[1],
    BASE[2] + s * AX[2] + lat * LAT[2] + ant * ANT[2],
  ];
}

export function wh(p: V3): V3 {
  const d = sub(p, BASE);
  return [dot(d, AX), dot(d, LAT), dot(d, ANT)];
}

/** Без выделения памяти: пересчёт точки в систему H во внутренний буфер. */
const HH: V3 = [0, 0, 0];
function toH(x: number, y: number, z: number): V3 {
  const dx = x - BASE[0], dy = y - BASE[1], dz = z - BASE[2];
  HH[0] = dx * AX[0] + dy * AX[1] + dz * AX[2];
  HH[1] = dx * LAT[0] + dy * LAT[1] + dz * LAT[2];
  HH[2] = dx * ANT[0] + dy * ANT[1] + dz * ANT[2];
  return HH;
}

/* ---------- трубки (сосуды) ---------- */

export interface Tube {
  x: Float64Array;
  y: Float64Array;
  z: Float64Array;
  r: Float64Array;
  box: [number, number, number, number, number, number];
}

/** Кривая Катмулла — Рома через опорные точки. */
export function curvePoints(pts: V3[], samples = 24): V3[] {
  if (pts.length === 2) {
    const out: V3[] = [];
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      out.push([pts[0][0] + (pts[1][0] - pts[0][0]) * t, pts[0][1] + (pts[1][1] - pts[0][1]) * t, pts[0][2] + (pts[1][2] - pts[0][2]) * t]);
    }
    return out;
  }
  const n = pts.length - 1;
  const out: V3[] = [];
  for (let i = 0; i <= samples; i++) {
    const f = (i / samples) * n;
    const s = Math.min(Math.floor(f), n - 1);
    const t = f - s;
    const p0 = pts[Math.max(s - 1, 0)], p1 = pts[s], p2 = pts[s + 1], p3 = pts[Math.min(s + 2, n)];
    const t2 = t * t, t3 = t2 * t;
    const o: number[] = [0, 0, 0];
    for (let k = 0; k < 3; k++)
      o[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
    out.push([o[0], o[1], o[2]]);
  }
  return out;
}

/** Трубка по опорным точкам; радиусы — на опорных точках (линейно по длине). ext — удлинение концов (для просветов). */
export function makeTube(ctrl: V3[], radii: number[], samples = 30, ext: [number, number] = [0, 0]): Tube {
  const pts = curvePoints(ctrl, samples);
  const rr = (i: number) => {
    if (radii.length === 1) return radii[0];
    const f = (i / (pts.length - 1)) * (radii.length - 1);
    const s = Math.min(Math.floor(f), radii.length - 2);
    return radii[s] + (radii[s + 1] - radii[s]) * (f - s);
  };
  const P: V3[] = pts.slice();
  const R: number[] = pts.map((_, i) => rr(i));
  if (ext[0] > 0) {
    const t = norm(sub(pts[0], pts[1]));
    P.unshift([pts[0][0] + t[0] * ext[0], pts[0][1] + t[1] * ext[0], pts[0][2] + t[2] * ext[0]]);
    R.unshift(R[0]);
  }
  if (ext[1] > 0) {
    const n = pts.length;
    const t = norm(sub(pts[n - 1], pts[n - 2]));
    P.push([pts[n - 1][0] + t[0] * ext[1], pts[n - 1][1] + t[1] * ext[1], pts[n - 1][2] + t[2] * ext[1]]);
    R.push(R[R.length - 1]);
  }
  const x = Float64Array.from(P, (p) => p[0]);
  const y = Float64Array.from(P, (p) => p[1]);
  const z = Float64Array.from(P, (p) => p[2]);
  const r = Float64Array.from(R);
  const rm = Math.max(...R);
  const box: Tube['box'] = [
    Math.min(...x) - rm, Math.min(...y) - rm, Math.min(...z) - rm,
    Math.max(...x) + rm, Math.max(...y) + rm, Math.max(...z) + rm,
  ];
  return { x, y, z, r, box };
}

export function sdTube(px: number, py: number, pz: number, t: Tube): number {
  const b = t.box;
  const dx = Math.max(b[0] - px, 0, px - b[3]);
  const dy = Math.max(b[1] - py, 0, py - b[4]);
  const dz = Math.max(b[2] - pz, 0, pz - b[5]);
  if (dx > 0 || dy > 0 || dz > 0) {
    const dd = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dd > 0.4) return dd;
  }
  let best = 1e9;
  const n = t.x.length - 1;
  for (let i = 0; i < n; i++) {
    const ax = t.x[i], ay = t.y[i], az = t.z[i];
    const bx = t.x[i + 1] - ax, by = t.y[i + 1] - ay, bz = t.z[i + 1] - az;
    const qx = px - ax, qy = py - ay, qz = pz - az;
    const l2 = bx * bx + by * by + bz * bz || 1e-9;
    const h = clamp((qx * bx + qy * by + qz * bz) / l2, 0, 1);
    const ex = qx - bx * h, ey = qy - by * h, ez = qz - bz * h;
    const d = Math.sqrt(ex * ex + ey * ey + ez * ez) - (t.r[i] + (t.r[i + 1] - t.r[i]) * h);
    if (d < best) best = d;
  }
  return best;
}

/** Конус-капсула с двумя радиусами. */
export function sdCone(px: number, py: number, pz: number, a: V3, b: V3, ra: number, rb: number): number {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const qx = px - a[0], qy = py - a[1], qz = pz - a[2];
  const l2 = bx * bx + by * by + bz * bz || 1e-9;
  const h = clamp((qx * bx + qy * by + qz * bz) / l2, 0, 1);
  const ex = qx - bx * h, ey = qy - by * h, ez = qz - bz * h;
  return Math.sqrt(ex * ex + ey * ey + ez * ez) - (ra + (rb - ra) * h);
}

/* ---------- значения шума ---------- */

function hash3(i: number, j: number, k: number): number {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function vnoise(x: number, y: number, z: number): number {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
  const fx = x - i, fy = y - j, fz = z - k;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const a = hash3(i, j, k), b = hash3(i + 1, j, k), c = hash3(i, j + 1, k), d = hash3(i + 1, j + 1, k);
  const e = hash3(i, j, k + 1), f = hash3(i + 1, j, k + 1), g = hash3(i, j + 1, k + 1), h = hash3(i + 1, j + 1, k + 1);
  const x1 = a + (b - a) * u, x2 = c + (d - c) * u, x3 = e + (f - e) * u, x4 = g + (h - g) * u;
  const y1 = x1 + (x2 - x1) * v, y2 = x3 + (x4 - x3) * v;
  return y1 + (y2 - y1) * w;
}

export const ss = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/* ---------- ориентиры в мировых координатах ---------- */

const addv = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

export const AORTIC_CENTER: V3 = [-0.08, 0.66, -0.15];
export const AORTIC_DIR: V3 = norm([-0.13, 0.45, 0.07]);
export const PULM_CENTER: V3 = [0.28, 0.94, 0.2];
export const PULM_DIR: V3 = norm([0.2, 0.55, -0.22]);

/** Три направления от оси корня к синусам: первое задаёт «first», остальные через 120°. */
export function sinusDirs(axis: V3, first: V3): V3[] {
  const t = norm(axis);
  const d0 = norm(sub(first, scale(t, dot(first, t))));
  const d1 = cross(t, d0);
  return [0, 120, 240].map((deg) => {
    const a = (deg * Math.PI) / 180;
    return norm([d0[0] * Math.cos(a) + d1[0] * Math.sin(a), d0[1] * Math.cos(a) + d1[1] * Math.sin(a), d0[2] * Math.cos(a) + d1[2] * Math.sin(a)]);
  });
}

/** Синусы Вальсальвы аорты: правый коронарный (спереди), затем левый и некоронарный. */
export const AORTIC_SINUS_DIRS = sinusDirs(AORTIC_DIR, [-0.3, 0, 0.95]);
export const PULM_SINUS_DIRS = sinusDirs(PULM_DIR, [-0.2, 0.1, 0.95]);
export const AORTIC_SINUS_C: V3[] = AORTIC_SINUS_DIRS.map((d) => addv(addv(AORTIC_CENTER, AORTIC_DIR, 0.14), d, 0.2));
export const PULM_SINUS_C: V3[] = PULM_SINUS_DIRS.map((d) => addv(addv(PULM_CENTER, PULM_DIR, 0.12), d, 0.17));

/* ---------- сосуды ---------- */

const WALL = { aorta: 0.07, pt: 0.06, pa: 0.05, svc: 0.045, ivc: 0.05, pv: 0.042, br: 0.045 };

const tubeDef = (ctrl: V3[], radii: number[], wall: number, lumenExt: [number, number] = [0.3, 0.3], samples = 30) => ({
  outer: makeTube(ctrl, radii, samples),
  lumen: makeTube(ctrl, radii.map((r) => r - wall), samples, lumenExt),
});

const aoCtrl: V3[] = [
  addv(AORTIC_CENTER, AORTIC_DIR, -0.22),
  AORTIC_CENTER,
  [-0.16, 1.0, -0.09],
  [-0.19, 1.38, -0.12],
  [-0.05, 1.7, -0.28],
  [0.38, 1.8, -0.55],
  [0.76, 1.55, -0.82],
  [0.86, 0.95, -0.98],
  [0.86, 0.1, -1.08],
  [0.82, -0.85, -1.12],
];

export const VESSELS = {
  aorta: tubeDef(aoCtrl, [0.3, 0.3, 0.31, 0.3, 0.28, 0.27, 0.25, 0.23, 0.22, 0.22], WALL.aorta, [0.25, 0.3], 70),
  brachiocephalic: tubeDef([[-0.1, 1.68, -0.3], [-0.2, 2.1, -0.3], [-0.5, 2.55, -0.3]], [0.12, 0.115, 0.105], WALL.br),
  leftCarotid: tubeDef([[0.18, 1.78, -0.46], [0.1, 2.2, -0.4], [0.0, 2.6, -0.38]], [0.095, 0.09, 0.085], WALL.br),
  leftSubclavian: tubeDef([[0.45, 1.76, -0.6], [0.62, 2.1, -0.55], [0.9, 2.45, -0.5]], [0.105, 0.1, 0.09], WALL.br),
  trunk: tubeDef([addv(PULM_CENTER, PULM_DIR, -0.2), PULM_CENTER, [0.3, 1.2, 0.05], [0.3, 1.42, -0.2], [0.3, 1.52, -0.36]], [0.3, 0.3, 0.3, 0.29, 0.28], WALL.pt, [0.2, 0.0]),
  lpa: tubeDef([[0.3, 1.5, -0.36], [0.7, 1.5, -0.58], [1.2, 1.4, -0.82], [1.65, 1.28, -0.92]], [0.2, 0.18, 0.16, 0.15], WALL.pa, [0.1, 0.3]),
  rpa: tubeDef([[0.3, 1.5, -0.36], [-0.2, 1.46, -0.58], [-0.9, 1.36, -0.72], [-1.55, 1.26, -0.82]], [0.2, 0.19, 0.17, 0.15], WALL.pa, [0.1, 0.3]),
  svc: tubeDef([[-0.98, 0.9, -0.2], [-1.0, 1.4, -0.22], [-0.98, 2.05, -0.25]], [0.23, 0.215, 0.205], WALL.svc),
  ivc: tubeDef([[-0.98, 0.15, -0.28], [-0.99, -0.45, -0.36], [-0.97, -1.0, -0.44]], [0.25, 0.25, 0.24], WALL.ivc),
  pvLS: tubeDef([[0.45, 0.98, -0.98], [0.95, 1.05, -1.08], [1.5, 1.14, -1.18]], [0.135, 0.125, 0.115], WALL.pv),
  pvLI: tubeDef([[0.5, 0.5, -1.0], [1.0, 0.45, -1.1], [1.55, 0.4, -1.22]], [0.135, 0.125, 0.115], WALL.pv),
  pvRS: tubeDef([[-0.2, 0.98, -1.05], [-0.7, 1.05, -1.12], [-1.2, 1.1, -1.2]], [0.135, 0.125, 0.115], WALL.pv),
  pvRI: tubeDef([[-0.2, 0.5, -1.05], [-0.7, 0.45, -1.14], [-1.2, 0.4, -1.22]], [0.135, 0.125, 0.115], WALL.pv),
};

export type VesselKey = keyof typeof VESSELS;

/** Какой части атласа принадлежит сосуд. */
export const VESSEL_PART: Record<VesselKey, string> = {
  aorta: 'aorta',
  brachiocephalic: 'aortic-arch-branches',
  leftCarotid: 'aortic-arch-branches',
  leftSubclavian: 'aortic-arch-branches',
  trunk: 'pulmonary-trunk',
  lpa: 'pulmonary-arteries',
  rpa: 'pulmonary-arteries',
  svc: 'superior-vena-cava',
  ivc: 'inferior-vena-cava',
  pvLS: 'pulmonary-veins',
  pvLI: 'pulmonary-veins',
  pvRS: 'pulmonary-veins',
  pvRI: 'pulmonary-veins',
};

const VESSEL_KEYS = Object.keys(VESSELS) as VesselKey[];

/* ---------- камеры и мышцы в системе H ---------- */

interface Ell {
  c: V3;
  r: V3;
}
const E = (c: V3, r: V3): Ell => ({ c, r });
const sdE = (h: V3, e: Ell) => sdEllipsoid(h[0] - e.c[0], h[1] - e.c[1], h[2] - e.c[2], e.r[0], e.r[1], e.r[2]);

const LV_OUT = E([1.05, 0.3, -0.2], [1.32, 0.68, 0.64]);
const LV_IN = E([1.0, 0.29, -0.2], [1.22, 0.42, 0.4]);
const RV_OUT = E([0.8, -0.5, 0.46], [1.15, 0.7, 0.47]);
const RV_IN = E([0.8, -0.49, 0.46], [1.03, 0.58, 0.37]);
const RA_OUT = E([-0.5, -0.88, 0.0], [0.58, 0.46, 0.5]);
const RA_IN = E([-0.5, -0.88, 0.0], [0.51, 0.4, 0.44]);
const LA_OUT = E([-0.45, 0.35, -0.72], [0.4, 0.68, 0.42]);
const LA_IN = E([-0.45, 0.35, -0.72], [0.34, 0.62, 0.36]);
const RAA_OUT = E([-0.55, -0.5, 0.62], [0.3, 0.46, 0.16]);
const RAA_IN = E([-0.55, -0.5, 0.62], [0.24, 0.4, 0.1]);
const LAA_OUT = E([-0.25, 0.95, 0.0], [0.26, 0.22, 0.44]);
const LAA_IN = E([-0.25, 0.95, 0.0], [0.2, 0.16, 0.38]);

/** Ушки предсердий и воронка выводного тракта — капсулы в мировых координатах. */
export const CONUS_A: V3 = hw(0.25, -0.18, 0.56);
export const CONUS_B: V3 = addv(PULM_CENTER, PULM_DIR, -0.12);

/** Каналы клапанов между камерами. */
export const TV_A: V3 = hw(-0.25, -0.7, 0.22);
export const TV_B: V3 = hw(0.4, -0.55, 0.42);
export const MV_A: V3 = hw(-0.2, 0.32, -0.5);
export const MV_B: V3 = hw(0.52, 0.3, -0.3);
export const AV_A: V3 = hw(0.55, 0.12, -0.12);

/** Сосочковые мышцы: основание в стенке, вершина в полости. */
export interface Papillary {
  name: string;
  base: V3;
  tip: V3;
  r0: number;
  r1: number;
  side: 'L' | 'R';
}
export const PAPILLARY: Papillary[] = [
  { name: 'LV-anterolateral', base: hw(1.42, 0.72, -0.02), tip: hw(0.78, 0.42, -0.06), r0: 0.12, r1: 0.075, side: 'L' },
  { name: 'LV-posteromedial', base: hw(1.46, 0.48, -0.6), tip: hw(0.82, 0.3, -0.5), r0: 0.12, r1: 0.075, side: 'L' },
  { name: 'RV-anterior', base: hw(1.2, -0.85, 0.66), tip: hw(0.7, -0.66, 0.55), r0: 0.11, r1: 0.07, side: 'R' },
  { name: 'RV-posterior', base: hw(1.15, -0.95, 0.35), tip: hw(0.66, -0.75, 0.3), r0: 0.09, r1: 0.06, side: 'R' },
  { name: 'RV-septal', base: hw(1.0, -0.35, 0.66), tip: hw(0.55, -0.4, 0.6), r0: 0.06, r1: 0.04, side: 'R' },
];

/** Трабекула правого желудочка: перемычка от перегородки к передней сосочковой мышце (септомаргинальная). */
export const MOD_A: V3 = hw(1.62, -0.12, 0.42);
export const MOD_B: V3 = hw(1.2, -0.85, 0.66);

/* ---------- плоскости разреза ---------- */

export type CutKey = 'side' | 'fundus';

export interface CutPlane {
  n: V3;
  /** Убирается то, где n·p − c > 0. */
  c: number;
}

export function cutPlane(kind: CutKey): CutPlane {
  if (kind === 'fundus') return { n: [0, 1, 0], c: -0.5 };
  // четырёхкамерный срез: через центры трёхстворчатого и митрального клапанов и верхушку; убирается передняя половина
  const T = hw(0.1, -0.64, 0.38);
  const M = hw(0.1, 0.32, -0.4);
  const Ap = hw(2.2, 0.28, -0.22);
  let n = norm(cross(sub(M, T), sub(Ap, T)));
  if (dot(n, ANT) < 0) n = scale(n, -1);
  const c = dot(n, T) + 0.02;
  return { n, c };
}

/* ---------- основное поле ---------- */

export interface Eval {
  /** Внешняя поверхность всего сердца (отрицательно внутри). */
  outer: number;
  /** Полость: отрицательно внутри крови. */
  cavity: number;
  /** Сосочковые мышцы и перемычка (отрицательно внутри). */
  muscle: number;
  /** Итог: стенка = внутри внешней поверхности, вне полости, плюс мышцы. */
  solid: number;
}

const ev: Eval = { outer: 0, cavity: 0, muscle: 0, solid: 0 };

function ridged(x: number, y: number, z: number, f: number): number {
  const n = vnoise(x * f, y * f, z * f);
  const r = 1 - Math.abs(2 * n - 1);
  return r * r * r;
}

/** Внешнее тело сердца и сосудов. */
export function sdOuter(x: number, y: number, z: number): number {
  const h = toH(x, y, z);
  let body = sdE(h, LV_OUT);
  body = smin(body, sdE(h, RV_OUT), 0.38);
  body = smin(body, sdE(h, RA_OUT), 0.12);
  body = smin(body, sdE(h, LA_OUT), 0.12);
  body = smin(body, sdE(h, RAA_OUT), 0.16);
  body = smin(body, sdE(h, LAA_OUT), 0.14);
  body = smin(body, sdCone(x, y, z, CONUS_A, CONUS_B, 0.32, 0.31), 0.1);
  let vessels = 1e9;
  for (const k of VESSEL_KEYS) {
    const d = sdTube(x, y, z, VESSELS[k].outer);
    if (d < vessels) vessels = d;
  }
  for (let i = 0; i < 3; i++) {
    const s = AORTIC_SINUS_C[i];
    const d = Math.hypot(x - s[0], y - s[1], z - s[2]) - 0.2;
    if (d < vessels) vessels = d;
    const p = PULM_SINUS_C[i];
    const e = Math.hypot(x - p[0], y - p[1], z - p[2]) - 0.17;
    if (e < vessels) vessels = e;
  }
  return smin(body, vessels, 0.12);
}

/** Полость без трабекул: кровь в камерах и просветы сосудов. */
export function sdCavityBase(x: number, y: number, z: number): number {
  const h = toH(x, y, z);
  let c = sdE(h, LV_IN);
  const rvIn = Math.max(sdE(h, RV_IN), -sdE(h, LV_OUT));
  c = smin(c, rvIn, 0.04);
  c = smin(c, sdE(h, RA_IN), 0.06);
  c = smin(c, sdE(h, LA_IN), 0.06);
  c = smin(c, sdE(h, RAA_IN), 0.05);
  c = smin(c, sdE(h, LAA_IN), 0.05);
  c = smin(c, sdCone(x, y, z, CONUS_A, CONUS_B, 0.21, 0.21), 0.06);
  c = smin(c, sdCone(x, y, z, TV_A, TV_B, 0.27, 0.27), 0.06);
  c = smin(c, sdCone(x, y, z, MV_A, MV_B, 0.33, 0.33), 0.06);
  c = smin(c, sdCone(x, y, z, AV_A, AORTIC_CENTER, 0.3, 0.29), 0.06);
  for (const k of VESSEL_KEYS) {
    const d = sdTube(x, y, z, VESSELS[k].lumen);
    if (d < c + 0.2) c = smin(c, d, 0.04);
  }
  for (let i = 0; i < 3; i++) {
    const s = AORTIC_SINUS_C[i];
    c = Math.min(c, Math.hypot(x - s[0], y - s[1], z - s[2]) - 0.145);
    const p = PULM_SINUS_C[i];
    c = Math.min(c, Math.hypot(x - p[0], y - p[1], z - p[2]) - 0.115);
  }
  return c;
}

/** Расстояние до сосочковых мышц отдельно и до перемычки. */
function papDist(x: number, y: number, z: number): number {
  let m = 1e9;
  for (const p of PAPILLARY) {
    const d = sdCone(x, y, z, p.base, p.tip, p.r0, p.r1);
    if (d < m) m = d;
  }
  return m;
}
const modDist = (x: number, y: number, z: number) => sdCone(x, y, z, MOD_A, MOD_B, 0.045, 0.05);

/** Трабекулы: слой выступов на внутренней поверхности желудочков, ушек и предсердий. */
function trabeculae(x: number, y: number, z: number, cav: number): number {
  if (cav < -0.16 || cav > 0.14) return 0;
  const h = toH(x, y, z);
  const s = h[0];
  let amp = 0;
  const lv = sdE(h, LV_OUT);
  const inLV = lv < 0.02;
  // левый желудочек: сетка трабекул у верхушки, гладкая перегородка и выводной тракт
  if (inLV) amp = 0.05 * ss(1.15, 1.75, s) * ss(-0.05, 0.3, h[1]);
  // правый желудочек: грубые трабекулы по всей стенке, гладкий конус у лёгочного ствола
  else if (sdE(h, RV_OUT) < 0.02) amp = 0.07 * ss(0.35, 1.0, s);
  if (amp > 0) return amp * ridged(x, y, z, 6.2);
  // ушки: гребенчатые мышцы — параллельные валики
  if (sdE(h, RAA_OUT) < 0.12) {
    const u = (x * 0.9 + y * 0.2 + z * 0.4) * 38;
    return 0.028 * Math.pow(Math.max(0, Math.cos(u)), 3);
  }
  if (sdE(h, LAA_OUT) < 0.12) {
    const u = (y * 0.9 + z * 0.5 - x * 0.3) * 38;
    return 0.028 * Math.pow(Math.max(0, Math.cos(u)), 3);
  }
  // правое предсердие: гребенчатые мышцы по передней стенке
  if (sdE(h, RA_OUT) < 0.05 && h[2] > 0.08) {
    const u = (h[0] * 1.0 + h[1] * 0.2) * 44;
    return 0.022 * Math.pow(Math.max(0, Math.cos(u)), 3) * ss(0.05, 0.3, h[2]);
  }
  return 0;
}

/** Полость вместе с трабекулами. */
export function sdCavity(x: number, y: number, z: number): number {
  const c = sdCavityBase(x, y, z);
  return c < 0.3 ? c + trabeculae(x, y, z, c) : c;
}

/** Полное поле: стенка сердца и сосудов с вырезанными полостями. */
export function evalHeart(x: number, y: number, z: number): Eval {
  const outer = sdOuter(x, y, z);
  ev.outer = outer;
  let cav = 1e9;
  let solid = outer;
  if (outer < 0.15) {
    cav = sdCavity(x, y, z);
    solid = smax(outer, -cav, 0.025);
  }
  ev.cavity = cav;
  let mus = 1e9;
  if (cav < 0.3 && cav > -0.9) {
    mus = smin(papDist(x, y, z), modDist(x, y, z), 0.05);
    if (mus < solid) solid = smin(solid, Math.max(mus, outer), 0.04);
  }
  ev.muscle = mus;
  ev.solid = solid;
  return ev;
}

/** Поле стенки с плоскостью разреза (если задана). */
export function solidField(plane: CutPlane | null): (x: number, y: number, z: number) => number {
  if (!plane) return (x, y, z) => evalHeart(x, y, z).solid;
  const { n, c } = plane;
  return (x, y, z) => {
    const cut = n[0] * x + n[1] * y + n[2] * z - c;
    if (cut > 0.4) return cut;
    return smax(evalHeart(x, y, z).solid, cut, 0.012);
  };
}

/* ---------- принадлежность части ---------- */

export type Surf = 0 | 1 | 2; // снаружи, внутри (полость), срез

const lengthTo = (x: number, y: number, z: number, c: V3, r: number) => Math.hypot(x - c[0], y - c[1], z - c[2]) - r;

/** Часть атласа и тип поверхности для точки на сетке. */
export function classify(x: number, y: number, z: number, plane: CutPlane | null): { part: string; surf: Surf } {
  const e = evalHeart(x, y, z);
  const h = toH(x, y, z);
  const hs: V3 = [h[0], h[1], h[2]];
  const cut = plane ? plane.n[0] * x + plane.n[1] * y + plane.n[2] * z - plane.c : 1e9;
  const dOut = Math.abs(e.outer);
  const dCav = Math.abs(e.cavity);
  const dMus = Math.abs(e.muscle);
  const dCut = Math.abs(cut);
  let surf: Surf = 0;
  if (dCut < dOut && dCut < dCav && dCut < dMus) surf = 2;
  else if (dCav < dOut || dMus < dOut) surf = 1;

  const lvO = sdE(hs, LV_OUT);
  const rvO = sdE(hs, RV_OUT);

  // сосочковые мышцы и перемычка
  if (surf !== 0 && (dMus < 0.04 || (surf === 2 && e.muscle < 0))) {
    const pd = papDist(x, y, z);
    const md = modDist(x, y, z);
    if (surf === 1 && dMus <= dCav + 0.004) return { part: pd < md ? 'papillary-muscles' : 'right-ventricle', surf };
    if (surf === 2 && pd < 0) return { part: 'papillary-muscles', surf };
  }

  const dist: Record<string, number> = {};
  const put = (k: string, d: number) => {
    if (dist[k] === undefined || d < dist[k]) dist[k] = d;
  };

  if (surf === 0) {
    put('left-ventricle', Math.abs(lvO));
    put('right-ventricle', Math.min(Math.abs(rvO), Math.abs(sdCone(x, y, z, CONUS_A, CONUS_B, 0.32, 0.31))));
    put('right-atrium', Math.min(Math.abs(sdE(hs, RA_OUT)), Math.abs(sdE(hs, RAA_OUT))));
    put('left-atrium', Math.min(Math.abs(sdE(hs, LA_OUT)), Math.abs(sdE(hs, LAA_OUT))));
    for (const k of VESSEL_KEYS) put(VESSEL_PART[k], Math.abs(sdTube(x, y, z, VESSELS[k].outer)));
    for (let i = 0; i < 3; i++) {
      put('aorta', Math.abs(lengthTo(x, y, z, AORTIC_SINUS_C[i], 0.2)));
      put('pulmonary-trunk', Math.abs(lengthTo(x, y, z, PULM_SINUS_C[i], 0.17)));
    }
  } else if (surf === 1) {
    if (rvO < 0.0 && lvO < 0.012) return { part: 'septum', surf };
    put('left-ventricle', Math.abs(sdE(hs, LV_IN)));
    put('right-ventricle', Math.min(Math.abs(Math.max(sdE(hs, RV_IN), -lvO)), Math.abs(sdCone(x, y, z, CONUS_A, CONUS_B, 0.21, 0.21)), Math.abs(sdCone(x, y, z, TV_A, TV_B, 0.27, 0.27)) + 0.05));
    put('right-atrium', Math.min(Math.abs(sdE(hs, RA_IN)), Math.abs(sdE(hs, RAA_IN))));
    put('left-atrium', Math.min(Math.abs(sdE(hs, LA_IN)), Math.abs(sdE(hs, LAA_IN))));
    put('left-ventricle', Math.abs(sdCone(x, y, z, AV_A, AORTIC_CENTER, 0.3, 0.29)) + 0.04);
    put('left-ventricle', Math.abs(sdCone(x, y, z, MV_A, MV_B, 0.33, 0.33)) + 0.1);
    for (const k of VESSEL_KEYS) put(VESSEL_PART[k], Math.abs(sdTube(x, y, z, VESSELS[k].lumen)));
    for (let i = 0; i < 3; i++) {
      put('aorta', Math.abs(lengthTo(x, y, z, AORTIC_SINUS_C[i], 0.145)));
      put('pulmonary-trunk', Math.abs(lengthTo(x, y, z, PULM_SINUS_C[i], 0.115)));
    }
  } else {
    // срез: часть, в теле которой лежит точка
    if (rvO < 0 && lvO < 0 && sdE(hs, LV_IN) > 0.0) return { part: 'septum', surf };
    put('left-ventricle', lvO);
    put('right-ventricle', Math.min(rvO, sdCone(x, y, z, CONUS_A, CONUS_B, 0.32, 0.31)));
    put('right-atrium', Math.min(sdE(hs, RA_OUT), sdE(hs, RAA_OUT)) + 0.02);
    put('left-atrium', Math.min(sdE(hs, LA_OUT), sdE(hs, LAA_OUT)) + 0.02);
    for (const k of VESSEL_KEYS) put(VESSEL_PART[k], sdTube(x, y, z, VESSELS[k].outer));
    for (let i = 0; i < 3; i++) {
      put('aorta', lengthTo(x, y, z, AORTIC_SINUS_C[i], 0.2));
      put('pulmonary-trunk', lengthTo(x, y, z, PULM_SINUS_C[i], 0.17));
    }
  }
  let best = 'left-ventricle';
  let bd = 1e9;
  for (const k in dist)
    if (dist[k] < bd) {
      bd = dist[k];
      best = k;
    }
  return { part: best, surf };
}

function project(f: (x: number, y: number, z: number) => number, p: V3, lift: number, iters: number): V3 {
  let [x, y, z] = p;
  const e = 0.004;
  for (let i = 0; i < iters; i++) {
    const d = f(x, y, z) - lift;
    const gx = f(x + e, y, z) - f(x - e, y, z);
    const gy = f(x, y + e, z) - f(x, y - e, z);
    const gz = f(x, y, z + e) - f(x, y, z - e);
    const gl = Math.hypot(gx, gy, gz) || 1;
    const k = d / (gl / (2 * e));
    x -= (gx / gl) * k * 0.9;
    y -= (gy / gl) * k * 0.9;
    z -= (gz / gl) * k * 0.9;
  }
  return [x, y, z];
}

/** Проекция точки на внешнюю поверхность сердца (с отступом наружу). */
export const projectOuter = (p: V3, lift = 0, iters = 14): V3 => project(sdOuter, p, lift, iters);
/** Проекция на поверхность полости (эндокард); lift > 0 — отступ в сторону крови. */
export const projectCavity = (p: V3, lift = 0, iters = 14): V3 => project((x, y, z) => -sdCavityBase(x, y, z), p, lift, iters);

/** Границы сетки (мировые координаты). */
export const BOUNDS = { min: [-1.95, -1.95, -1.6] as V3, max: [1.95, 2.8, 1.6] as V3 };

export const LA_CENTER = hw(LA_OUT.c[0], LA_OUT.c[1], LA_OUT.c[2]);
export const RA_CENTER = hw(RA_OUT.c[0], RA_OUT.c[1], RA_OUT.c[2]);
export const LV_CENTER = hw(LV_OUT.c[0], LV_OUT.c[1], LV_OUT.c[2]);
export const RV_CENTER = hw(RV_OUT.c[0], RV_OUT.c[1], RV_OUT.c[2]);
export const APEX = hw(2.3, 0.28, -0.22);
