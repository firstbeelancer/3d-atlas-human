/*
  Поля расстояний уха: раковина (рельеф из таблиц), хрящ, височная кость с полостями, воздухоносные пространства и косточки.
  Все функции принимают координаты «голова» (мм), кроме раковины — она считается в «ушных» координатах (x, p, q).
*/
import {
  BONY_END_X, CANALS, CANAL_PTS, CANAL_R, COCH_TH, EU_DIR, EU_S0, EU_S1, FACIAL_PTS, GENICULATE, IAM_PTS, ICA_PTS, ICA_R, JUGULAR_C,
  RW, SIGMOID_PTS, SIGMOID_R, T, TM_ANT, TM_N, TM_RA, TM_RU, TM_UP, VEST_C, canalPts, ear, cochCenter, cochTube, tmDepth, toTM, vadd, vlen, vmul, vnorm, vsub,
  type V3,
} from './anatomy';

export type F3 = (x: number, y: number, z: number) => number;
export type Box = [number, number, number, number, number, number];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const sstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Гладкий минимум (полином): сращивание форм без швов. */
export const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
export const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);

/* ------------------------------------------------------------------ примитивы */

export function sphereF(c: V3, r: number): F3 {
  return (x, y, z) => Math.hypot(x - c[0], y - c[1], z - c[2]) - r;
}

/** Эллипсоид с полуосями в системе перепонки (a, u, d), центр — в голове. */
export function ellipsoidT(c: V3, r: V3): F3 {
  const m = Math.min(r[0], r[1], r[2]);
  return (x, y, z) => {
    const dx = x - c[0];
    const dy = y - c[1];
    const dz = z - c[2];
    const px = (dx * TM_ANT[0] + dy * TM_ANT[1] + dz * TM_ANT[2]) / r[0];
    const py = (dx * TM_UP[0] + dy * TM_UP[1] + dz * TM_UP[2]) / r[1];
    const pz = (dx * TM_N[0] + dy * TM_N[1] + dz * TM_N[2]) / r[2];
    const k0 = Math.hypot(px, py, pz);
    if (k0 < 1) return (k0 - 1) * m;
    const k1 = Math.hypot(px / r[0], py / r[1], pz / r[2]);
    return (k0 * (k0 - 1)) / (k1 || 1);
  };
}

export function capsuleF(a: V3, b: V3, ra: number, rb = ra): F3 {
  const bx = b[0] - a[0];
  const by = b[1] - a[1];
  const bz = b[2] - a[2];
  const l2 = bx * bx + by * by + bz * bz || 1;
  return (x, y, z) => {
    const px = x - a[0];
    const py = y - a[1];
    const pz = z - a[2];
    const h = clamp01((px * bx + py * by + pz * bz) / l2);
    return Math.hypot(px - bx * h, py - by * h, pz - bz * h) - (ra + (rb - ra) * h);
  };
}

/** Ограничивающая коробка: вне её (с запасом) функция возвращает безопасное большое расстояние. */
export function boxed(f: F3, min: V3, max: V3, margin: number): F3 {
  return (x, y, z) => {
    const dx = Math.max(min[0] - x, 0, x - max[0]);
    const dy = Math.max(min[1] - y, 0, y - max[1]);
    const dz = Math.max(min[2] - z, 0, z - max[2]);
    if (dx > margin || dy > margin || dz > margin) return margin + Math.hypot(dx, dy, dz) * 0.5;
    return f(x, y, z);
  };
}

export interface Seg {
  a: V3;
  b: V3;
  ra: number;
  rb: number;
}

export const chainSegs = (pts: V3[], r: number | ((i: number, n: number) => number)): Seg[] =>
  pts.slice(0, -1).map((a, i) => {
    const rr = (j: number) => (typeof r === 'number' ? r : r(j, pts.length - 1));
    return { a, b: pts[i + 1], ra: rr(i), rb: rr(i + 1) };
  });

/**
 * Набор капсул со сеткой ячеек: считает только соседей точки, поэтому сотни сегментов (улитка, каналы, ячейки сосцевидного
 * отростка) не замедляют поле. Гладкое объединение с радиусом сглаживания k.
 */
export function capsuleSet(segs: Seg[], k: number, cell = 3): F3 {
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  const pad = 1.2;
  for (const s of segs) {
    const r = Math.max(s.ra, s.rb) + pad;
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], s.a[i] - r, s.b[i] - r);
      max[i] = Math.max(max[i], s.a[i] + r, s.b[i] + r);
    }
  }
  const nx = Math.ceil((max[0] - min[0]) / cell) + 1;
  const ny = Math.ceil((max[1] - min[1]) / cell) + 1;
  const nz = Math.ceil((max[2] - min[2]) / cell) + 1;
  const buckets: number[][] = Array.from({ length: nx * ny * nz }, () => []);
  const fs = segs.map((s) => capsuleF(s.a, s.b, s.ra, s.rb));
  segs.forEach((s, si) => {
    const r = Math.max(s.ra, s.rb) + pad;
    const lo = [0, 1, 2].map((i) => Math.max(0, Math.floor((Math.min(s.a[i], s.b[i]) - r - min[i]) / cell)));
    const hi = [nx, ny, nz].map((n, i) => Math.min(n - 1, Math.floor((Math.max(s.a[i], s.b[i]) + r - min[i]) / cell)));
    for (let z = lo[2]; z <= hi[2]; z++)
      for (let y = lo[1]; y <= hi[1]; y++) for (let x = lo[0]; x <= hi[0]; x++) buckets[x + nx * (y + ny * z)].push(si);
  });
  return (x, y, z) => {
    const ix = Math.floor((x - min[0]) / cell);
    const iy = Math.floor((y - min[1]) / cell);
    const iz = Math.floor((z - min[2]) / cell);
    if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) return 4 + Math.max(min[0] - x, x - max[0], min[1] - y, y - max[1], min[2] - z, z - max[2], 0);
    const list = buckets[ix + nx * (iy + ny * iz)];
    if (list.length === 0) return 3;
    let d = fs[list[0]](x, y, z);
    for (let i = 1; i < list.length; i++) d = smin(d, fs[list[i]](x, y, z), k);
    return d;
  };
}

/** Расстояние до ломаной с радиусом по длине; возвращает расстояние до оси и радиус в ближайшей точке. */
function polyNearest(pts: V3[], radii: number[], x: number, y: number, z: number): [number, number] {
  let best = Infinity;
  let rr = radii[0];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const bx = b[0] - a[0];
    const by = b[1] - a[1];
    const bz = b[2] - a[2];
    const l2 = bx * bx + by * by + bz * bz || 1;
    const px = x - a[0];
    const py = y - a[1];
    const pz = z - a[2];
    const h = clamp01((px * bx + py * by + pz * bz) / l2);
    const d = Math.hypot(px - bx * h, py - by * h, pz - bz * h);
    if (d < best) {
      best = d;
      rr = radii[i] + (radii[i + 1] - radii[i]) * h;
    }
  }
  return [best, rr];
}

/* ------------------------------------------------------------------ слуховой проход */

/** Ось прохода, продолженная наружу (в раковину) и чуть внутрь, с радиусами. */
const CANAL_LAT = vadd(CANAL_PTS[5], vmul(vnorm(vsub(CANAL_PTS[5], CANAL_PTS[4])), 16));
export const CANAL_AXIS: V3[] = [...CANAL_PTS, CANAL_LAT];
export const CANAL_RADII: number[] = [...CANAL_R, CANAL_R[5] + 0.4];

/** Расстояние от точки до стенки просвета прохода с припуском off (отрицательно внутри). */
export function canalF(off: number): F3 {
  return (x, y, z) => {
    const [d, r] = polyNearest(CANAL_AXIS, CANAL_RADII, x, y, z);
    return d - (r + off);
  };
}

/* ------------------------------------------------------------------ ушная раковина: таблицы рельефа */

type P2 = [number, number];
/** Контур раковины (p — вверх, q — назад), по кругу. */
const OUTLINE: P2[] = [
  [9, -14], [17, -13.8], [24, -10.5], [29.5, -4.5], [33, 3], [33.5, 11], [30.5, 17], [25, 21], [18, 22.8], [10, 23], [2, 22], [-6, 19.5], [-13, 15.5],
  [-19, 11], [-24, 6.5], [-28.5, 2], [-31.5, -2.5], [-32, -8], [-29, -12.5], [-24, -14], [-19, -13.5], [-15.5, -12.5], [-13, -10], [-11.2, -8.5], [-9, -7.2],
  [-7, -7.8], [-5.2, -10], [-3.5, -12.5], [0, -14], [4, -14.2],
];
const AH_MAIN: P2[] = [[-11.5, 4], [-8, 8], [-3, 10.5], [3, 11.5], [8.5, 11.5]];
const AH_SUP: P2[] = [[8.5, 11.5], [14, 10], [19.5, 6.5], [23.5, 1], [24.5, -3.5]];
const AH_INF: P2[] = [[8.5, 11.5], [10.5, 6], [12, 0], [11.5, -5.5], [10.5, -9]];
const CRUS: P2[] = [[10.5, -12.8], [6.5, -9], [4.3, -4.5], [4.0, 0.5]];

function closedSpline(pts: P2[], sub: number): P2[] {
  const n = pts.length;
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    for (let s = 0; s < sub; s++) {
      const t = s / sub;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

function distPoly(poly: P2[], p: number, q: number, closed: boolean): number {
  let best = Infinity;
  const n = poly.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const bx = b[0] - a[0];
    const by = b[1] - a[1];
    const l2 = bx * bx + by * by || 1;
    const h = clamp01(((p - a[0]) * bx + (q - a[1]) * by) / l2);
    const d = Math.hypot(p - a[0] - bx * h, q - a[1] - by * h);
    if (d < best) best = d;
  }
  return best;
}

function inside(poly: P2[], p: number, q: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [pi, qi] = poly[i];
    const [pj, qj] = poly[j];
    if (qi > q !== qj > q && p < ((pj - pi) * (q - qi)) / (qj - qi) + pi) c = !c;
  }
  return c;
}

const bump = (d: number, w: number) => (d >= w ? 0 : 0.5 * (1 + Math.cos((Math.PI * d) / w)));

export const AURICLE_REGIONS = [
  'helix', 'helix-crus', 'antihelix', 'scapha', 'triangular-fossa', 'cymba', 'concha', 'tragus', 'antitragus', 'intertragic-notch', 'lobule', 'auricle-back',
  'meatus-cartilaginous',
] as const;
const RID = Object.fromEntries(AURICLE_REGIONS.map((r, i) => [r, i])) as Record<(typeof AURICLE_REGIONS)[number], number>;

export const TAB = { p0: -39, q0: -21, step: 0.15, np: 521, nq: 321 };
export interface Tables {
  H: Float32Array;
  T: Float32Array;
  E: Float32Array;
  Tc: Float32Array;
  Ec: Float32Array;
  region: Uint8Array;
}
let tables: Tables | null = null;

export function auricleTables(): Tables {
  if (tables) return tables;
  const { p0, q0, step, np, nq } = TAB;
  const outline = closedSpline(OUTLINE, 8);
  const size = np * nq;
  const H = new Float32Array(size);
  const Tt = new Float32Array(size);
  const E = new Float32Array(size);
  const Tc = new Float32Array(size);
  const Ec = new Float32Array(size);
  const region = new Uint8Array(size);
  for (let i = 0; i < np; i++) {
    const p = p0 + i * step;
    for (let j = 0; j < nq; j++) {
      const q = q0 + j * step;
      const idx = i * nq + j;
      const dd = distPoly(outline, p, q, true);
      const e = inside(outline, p, q) ? dd : -dd;
      E[idx] = e;
      if (e < -7) {
        H[idx] = 0;
        Tt[idx] = 2.2;
        Tc[idx] = 0.6;
        Ec[idx] = e;
        continue;
      }
      const rc1 = Math.hypot((p + 4.5) / 9.5, (q + 1) / 8);
      const rc2 = Math.hypot((p - 8.5) / 4.5, (q + 2.5) / 7);
      const w1 = 1 - sstep(0.85, 1.25, rc1);
      const w2 = 1 - sstep(0.85, 1.25, rc2);
      let h = 9 * sstep(0.6, 1.45, Math.min(rc1, rc2)) + 3 * w2 * (1 - w1);
      const ah = Math.max(bump(distPoly(AH_MAIN, p, q, false), 3.6), 0.9 * bump(distPoly(AH_SUP, p, q, false), 3.4), 0.9 * bump(distPoly(AH_INF, p, q, false), 3));
      const crus = bump(distPoly(CRUS, p, q, false), 2.4);
      const anterior = sstep(5.5, 1.5, p) * sstep(-7, -10, q);
      const hmask = sstep(-21, -16, p) * (1 - anterior);
      const helix = hmask * bump(Math.abs(e - 2.7), 2.5);
      const gw = sstep(-13, -8, p) * hmask * bump(Math.abs(e - 7.4), 3.2) * (1 - Math.min(1, ah * 1.6)) * (1 - crus);
      const tw = bump(Math.hypot((p - 17.5) / 6.5, (q - 3.2) / 5.2), 1);
      const lw = sstep(-18, -23.5, p);
      h += 4 * ah + 4.2 * crus + 4.6 * helix - 3.6 * gw - 3.2 * tw - 5 * lw;
      H[idx] = h;
      Tt[idx] = 2.2 + 1.5 * helix + 0.8 * ah + 2.8 * lw - 0.3 * w1 - 0.2 * gw;
      Tc[idx] = Math.max(0.5, Tt[idx] - 1.3) * (1 - lw * 0.9);
      Ec[idx] = e - 0.85 - 7 * lw;
      // область поверхности (для разметки частей раковины)
      let r: number = RID.concha;
      if (lw > 0.55) r = RID.lobule;
      else if (helix > 0.4) r = RID.helix;
      else if (crus > 0.45) r = RID['helix-crus'];
      else if (ah > 0.4) r = RID.antihelix;
      else if (tw > 0.45) r = RID['triangular-fossa'];
      else if (gw > 0.35) r = RID.scapha;
      else if (rc2 < 1.12 && p > 3) r = RID.cymba;
      else if (rc1 < 1.25) r = RID.concha;
      else r = e < 7 ? RID.scapha : RID.antihelix;
      if (p > -17 && p < -10.5 && q > -1 && q < 7.5 && rc1 > 0.85) r = RID.antitragus;
      if (p > -6.5 && p < 2 && q < -5) r = RID.tragus;
      if (p > -11 && p < -6.5 && q < -3) r = RID['intertragic-notch'];
      region[idx] = r;
    }
  }
  tables = { H, T: Tt, E, Tc, Ec, region };
  return tables;
}

function lookup(tab: Float32Array, p: number, q: number): number {
  const { p0, q0, step, np, nq } = TAB;
  let fi = (p - p0) / step;
  let fj = (q - q0) / step;
  if (fi < 0) fi = 0;
  else if (fi > np - 1.001) fi = np - 1.001;
  if (fj < 0) fj = 0;
  else if (fj > nq - 1.001) fj = nq - 1.001;
  const i = Math.floor(fi);
  const j = Math.floor(fj);
  const a = fi - i;
  const b = fj - j;
  const k = i * nq + j;
  return tab[k] * (1 - a) * (1 - b) + tab[k + nq] * a * (1 - b) + tab[k + 1] * (1 - a) * b + tab[k + nq + 1] * a * b;
}

export const earH = (p: number, q: number) => lookup(auricleTables().H, p, q);
export function earRegion(p: number, q: number): number {
  const { p0, q0, step, np, nq } = TAB;
  const i = Math.max(0, Math.min(np - 1, Math.round((p - p0) / step)));
  const j = Math.max(0, Math.min(nq - 1, Math.round((q - q0) / step)));
  return auricleTables().region[i * nq + j];
}

/** Пластина раковины: средняя поверхность по таблице высот, толщина по таблице, скруглённый край. */
function plate(tH: Float32Array, tT: Float32Array, tE: Float32Array): F3 {
  return (x, p, q) => {
    const E = lookup(tE, p, q);
    const half = lookup(tT, p, q) * 0.5;
    const s = x - lookup(tH, p, q);
    const inner = Math.max(half - E, 0);
    return Math.hypot(inner, s) - half;
  };
}

function ellipsoidE(c: V3, r: V3): F3 {
  const m = Math.min(r[0], r[1], r[2]);
  return (x, p, q) => {
    const px = (x - c[0]) / r[0];
    const py = (p - c[1]) / r[1];
    const pz = (q - c[2]) / r[2];
    const k0 = Math.hypot(px, py, pz);
    if (k0 < 1) return (k0 - 1) * m;
    const k1 = Math.hypot(px / r[0], py / r[1], pz / r[2]);
    return (k0 * (k0 - 1)) / (k1 || 1);
  };
}

const TRAGUS_C: V3 = [5.5, -2.5, -8.8];
const ANTITRAGUS_C: V3 = [5.5, -13.6, 3];

/** Голова (x, y, z) из ушных (x, p, q) — для канала внутри поля раковины. */

const LAT_CUT = BONY_END_X + 0.6;

/** Кожа раковины и наружной части прохода. Координаты — ушные (x, p, q). */
export function auricleSkin(): F3 {
  const t = auricleTables();
  const base = plate(t.H, t.T, t.E);
  const tragus = ellipsoidE(TRAGUS_C, [3.6, 4.8, 3.0]);
  const antitragus = ellipsoidE(ANTITRAGUS_C, [3.4, 3.0, 3.8]);
  const outer = canalF(1.9);
  const lumen = canalF(0.0);
  return (x, p, q) => {
    let d = smin(base(x, p, q), smin(tragus(x, p, q), antitragus(x, p, q), 1.2), 1.7);
    if (x > -16 && x < 4 && p > -22 && p < 20 && q > -18 && q < 14) {
      const w = ear(x, p, q);
      // наружная часть прохода — трубка, обрезанная на границе костной части
      const tube = Math.max(outer(w[0], w[1], w[2]), LAT_CUT - w[0]);
      d = smin(d, tube, 2.2);
      d = Math.max(d, -lumen(w[0], w[1], w[2]));
    }
    return d;
  };
}

/** Хрящ раковины и хрящевой части прохода (желобовидный хрящ). */
export function auricleCartilage(): F3 {
  const t = auricleTables();
  const base = plate(t.H, t.Tc, t.Ec);
  const tragus = ellipsoidE([5.5, -2.5, -8.8], [2.4, 3.6, 2.0]);
  const antitragus = ellipsoidE([5.5, -13.6, 3], [2.2, 2.0, 2.6]);
  const ringOut = canalF(1.2);
  const ringIn = canalF(0.2);
  return (x, p, q) => {
    let d = smin(base(x, p, q), smin(tragus(x, p, q), antitragus(x, p, q), 0.8), 1.2);
    if (x > -16 && x < 4 && p > -22 && p < 20 && q > -18 && q < 14) {
      const w = ear(x, p, q);
      const ring = Math.max(ringOut(w[0], w[1], w[2]), -ringIn(w[0], w[1], w[2]), LAT_CUT + 0.4 - w[0]);
      d = smin(d, ring, 1.0);
      d = Math.max(d, -ringIn(w[0], w[1], w[2]));
    }
    return d;
  };
}

/** Метка области кожи по ушным координатам и нормали (x-компонента нормали в ушной системе). */
export function skinRegion(x: number, p: number, q: number, nx: number): number {
  const w = ear(x, p, q);
  const [d] = polyNearest(CANAL_AXIS, CANAL_RADII, w[0], w[1], w[2]);
  const r = CANAL_RADII[3];
  if (x < 3.5 && d < r + 3) return RID['meatus-cartilaginous'];
  const reg = earRegion(p, q);
  if (nx < -0.25 && reg !== RID.helix) return RID['auricle-back'];
  if (nx < -0.55) return RID['auricle-back'];
  return reg;
}

/** Высота затенения: глубокие места темнее (раковина, проход). */
export function skinShade(x: number, p: number, q: number): number {
  const h = earH(p, q);
  let ao = 0.8 + 0.2 * sstep(0, 9, h);
  ao *= 1 - 0.7 * sstep(2, 14, -x);
  return ao;
}

/* ------------------------------------------------------------------ височная кость */

const jitter = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Пена воздухоносных ячеек сосцевидного отростка: случайный рост от пещеры, ячейки соединены. */
export function mastoidSegs(): Seg[] {
  const rnd = jitter(11);
  const A = T(-9.8, 8.6, -1.2);
  const cells: { c: V3; r: number }[] = [{ c: A, r: 3.0 }];
  const segs: Seg[] = [];
  const bound = ellipsoidT(T(-12.5, -3.5, 1.5), [9.2, 12.5, 7.4]);
  const facial = FACIAL_PTS.slice(7);
  const tries = 600;
  for (let n = 0; n < tries && cells.length < 78; n++) {
    const par = cells[Math.max(0, cells.length - 1 - Math.floor(Math.pow(rnd(), 1.8) * Math.min(cells.length, 14)))];
    const th = rnd() * Math.PI * 2;
    const ph = Math.acos(2 * rnd() - 1);
    let dir = vnorm([Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)]);
    dir = vnorm(vadd(dir, vadd(vmul(TM_ANT, -0.45), vmul(TM_UP, -0.25))));
    const r = 0.65 + 1.55 * Math.pow(rnd(), 1.5);
    const c = vadd(par.c, vmul(dir, (par.r + r) * 0.78));
    if (bound(c[0], c[1], c[2]) > -r - 0.5) continue;
    const tm = toTM(c);
    if (tm[0] > -4.2 || tm[0] < -15.2) continue;
    if (tm[2] > -0.2) continue;
    if (facial.some((f) => vlen(vsub(f, c)) < r + 1.9)) continue;
    if (SIGMOID_PTS.some((s) => vlen(vsub(s, c)) < SIGMOID_R + r + 1.0)) continue;
    cells.push({ c, r });
    segs.push({ a: par.c, b: c, ra: Math.min(par.r, r) * 0.55, rb: Math.min(par.r, r) * 0.55 });
  }
  for (const k of cells) segs.push({ a: k.c, b: k.c, ra: k.r, rb: k.r });
  return segs;
}

const MESO = ellipsoidT(T(0.2, -0.6, -3.3), [6.2, 7.5, 3.3]);
const ATTIC = ellipsoidT(T(0.3, 7.0, -2.8), [4.6, 3.9, 3.3]);
const HYPO = ellipsoidT(T(0, -6, -2.4), [4.5, 2.6, 2.4]);
const ADITUS = capsuleF(T(-3, 7.6, -2.6), T(-8, 8.4, -1.6), 1.5);
export const ANTRUM_C = T(-9.8, 8.6, -1.2);
const ANTRUM = ellipsoidT(ANTRUM_C, [3.8, 3.4, 3.4]);
export const OW_C = T(-3.56, 1.26, -6.9);
const OW_NICHE = sphereF(T(-3.6, 1.3, -5.2), 1.9);
const RW_NICHE = sphereF(vadd(RW.c, vmul(RW.n, 1.5)), 1.7);

/** Сегменты лабиринта (преддверие, каналы, улитка) с припуском на радиус. */
export function labSegs(extra: number): Seg[] {
  const segs: Seg[] = [];
  segs.push({ a: vadd(VEST_C, T(0, -0.45, 0)), b: vadd(VEST_C, T(0, 0.5, 0)), ra: 2.0 + extra, rb: 2.0 + extra });
  for (const c of CANALS) segs.push(...chainSegs(canalPts(c, 40), 0.82 + extra));
  const n = 150;
  const spiral = Array.from({ length: n + 1 }, (_, i) => (COCH_TH * i) / n);
  segs.push(...chainSegs(spiral.map(cochCenter), (i) => cochTube(spiral[Math.min(i, n)]) + 0.34 + extra));
  return segs;
}
let wallField: F3 | null = null;
/** Костная стенка лабиринта: воздух сюда не заходит (так возникает мыс), кроме окон. */
export function labWall(): F3 {
  wallField ??= capsuleSet(labSegs(0.55), 0.3, 3);
  return wallField;
}
const OW_FREE = sphereF(OW_C, 1.9);
const RW_FREE = sphereF(RW.c, 1.7);

let cellField: F3 | null = null;
/** Воздух: барабанная полость, аттик, антрум, ячейки; сверху ограничен перепонкой. */
export function airField(): F3 {
  cellField ??= capsuleSet(mastoidSegs(), 0.3, 2.6);
  const cells = cellField;
  const wall = labWall();
  return (x, y, z) => {
    let d = smin(MESO(x, y, z), ATTIC(x, y, z), 1.4);
    d = smin(d, HYPO(x, y, z), 1.0);
    d = smin(d, smin(ADITUS(x, y, z), ANTRUM(x, y, z), 0.9), 1.4);
    d = smin(d, smin(OW_NICHE(x, y, z), RW_NICHE(x, y, z), 0.6), 0.8);
    d = smin(d, cells(x, y, z), 0.9);
    d = smax(d, -Math.max(wall(x, y, z), -OW_FREE(x, y, z), -RW_FREE(x, y, z)), 0.5);
    // латеральная граница: сама перепонка (внутри кольца), выше — костная стенка аттика
    const a = x * TM_ANT[0] + y * TM_ANT[1] + z * TM_ANT[2];
    const u = x * TM_UP[0] + y * TM_UP[1] + z * TM_UP[2];
    const dn = x * TM_N[0] + y * TM_N[1] + z * TM_N[2];
    const rho = Math.hypot(a / TM_RA, u / TM_RU);
    const lim = tmDepth(Math.min(rho, 1)) - 0.08 + 0.58 * sstep(0.96, 1.12, rho);
    return smax(d, dn - lim, 0.25);
  };
}

/** Метка воздушного пространства по центру треугольника (голова). */
export const AIR_REGIONS = ['tympanic-cavity', 'epitympanic-recess', 'hypotympanum', 'promontory', 'mastoid-antrum', 'mastoid-cells'] as const;
export function airRegion(x: number, y: number, z: number): number {
  const tm = toTM([x, y, z]);
  if (vlen(vsub([x, y, z], ANTRUM_C)) < 4.6 || (tm[0] < -3 && tm[1] > 5.5 && tm[0] > -9)) return 4;
  if (tm[0] < -4.4 && (tm[1] < 11 || tm[0] < -9)) {
    // ячейки: всё заметно позади и вне полости
    if (MESO(x, y, z) > 0.4) return 5;
  }
  if (labWall()(x, y, z) < 0.55) return 3;
  if (tm[1] > 5.2) return 1;
  if (tm[1] < -4.6) return 2;
  return 0;
}

const boneMass = (() => {
  const squash = (f: F3, cy: number, ky: number): F3 => (x, y, z) => f(x, cy + (y - cy) * ky, z);
  const petrous = squash(capsuleF(T(-3, 0, -8), T(26, -3, -23), 14, 5.5), 0, 1.2);
  const mastoid = ellipsoidT(T(-12, -4, 2), [9.5, 13, 8]);
  const squamous = ellipsoidT(T(-6, 15, 2), [17, 6.5, 10]);
  const tympanic = capsuleF(CANAL_PTS[0], CANAL_PTS[3], 7.6, 7.2);
  const styloid = capsuleF(T(1, -16, -4), T(2.5, -31, -6), 1.6, 0.8);
  const base = ellipsoidT(T(-2, -13, -6), [13, 5, 10]);
  const prims = [petrous, mastoid, squamous, tympanic, styloid];
  const mass: F3 = (x, y, z) => {
    let d = smin(petrous(x, y, z), mastoid(x, y, z), 4);
    d = smin(d, squamous(x, y, z), 4);
    d = smin(d, tympanic(x, y, z), 3);
    d = smin(d, styloid(x, y, z), 2);
    return smin(d, base(x, y, z), 4);
  };
  const label = (x: number, y: number, z: number): number => {
    let best = 0;
    let bd = Infinity;
    prims.forEach((f, i) => {
      const v = f(x, y, z) * (i === 4 ? 0.8 : 1);
      if (v < bd) {
        bd = v;
        best = i;
      }
    });
    return best;
  };
  return { mass, label };
})();
export const BONE_REGIONS = ['petrous-part', 'mastoid-process', 'squamous-part', 'tympanic-part', 'styloid-process'] as const;
export const boneRegion = boneMass.label;

/** Все полости в кости, кроме воздухоносных: проход, лабиринт, каналы нервов и сосудов, труба. */
export function carveSegs(): Seg[] {
  const segs: Seg[] = [];
  segs.push(...chainSegs(CANAL_AXIS.slice(1), (i) => CANAL_RADII[i + 1]));
  segs.push(...chainSegs(FACIAL_PTS, 0.9));
  segs.push({ a: GENICULATE, b: GENICULATE, ra: 1.3, rb: 1.3 });
  segs.push(...chainSegs(IAM_PTS, 2.3));
  segs.push(...chainSegs(ICA_PTS.slice(0, 6), ICA_R + 0.4));
  segs.push(...chainSegs(SIGMOID_PTS, SIGMOID_R + 0.4));
  segs.push({ a: JUGULAR_C, b: JUGULAR_C, ra: 4.9, rb: 4.9 });
  segs.push(...chainSegs([EU_S0, vadd(EU_S0, vmul(EU_DIR, 3)), EU_S1], 1.8));
  segs.push(...chainSegs([T(0.6, 3.7, -5.5), T(4, 3, -7), T(8, 2.2, -9)], 1.2));
  segs.push(...chainSegs([T(-6, 2.0, -5.5), T(-7.2, -2, -5.2), T(-8.2, -6, -4.8)], 0.9));
  // лабиринт: преддверие, каналы, улитка
  segs.push(...labSegs(0).map((g) => g));
  return segs;
}

export function boneField(): F3 {
  const air = airField();
  const carve = capsuleSet(carveSegs(), 0.35, 3);
  const tmCyl = (x: number, y: number, z: number): number => {
    const a = x * TM_ANT[0] + y * TM_ANT[1] + z * TM_ANT[2];
    const u = x * TM_UP[0] + y * TM_UP[1] + z * TM_UP[2];
    const dn = x * TM_N[0] + y * TM_N[1] + z * TM_N[2];
    const e = Math.hypot(a / (TM_RA + 0.05), u / (TM_RU + 0.05)) - 1;
    return Math.max(e * 4.4, -dn, dn - 7);
  };
  const mass = boneMass.mass;
  return (x, y, z) => {
    const m = mass(x, y, z);
    if (m > 2.5) return m;
    let d = smax(m, -carve(x, y, z), 0.3);
    d = smax(d, -tmCyl(x, y, z), 0.3);
    d = smax(d, -(air(x, y, z) - 0.38), 0.3);
    return d;
  };
}

/* ------------------------------------------------------------------ косточки */

const smoothAll = (k: number, fs: F3[]): F3 => (x, y, z) => {
  let d = fs[0](x, y, z);
  for (let i = 1; i < fs.length; i++) d = smin(d, fs[i](x, y, z), k);
  return d;
};

export const MALLEUS_PTS = {
  head: T(0.4, 7.2, -3.0),
  neck: T(0.9, 4.7, -1.4),
  lateral: T(0.9, 3.7, -0.7),
  umbo: T(0, -0.4, -2.1),
  anterior: T(3.4, 5.2, -2.0),
};
export function malleusField(): F3 {
  const M = MALLEUS_PTS;
  return smoothAll(0.25, [
    ellipsoidT(M.head, [1.25, 1.55, 1.2]),
    capsuleF(T(0.5, 6.2, -2.7), M.neck, 0.72, 0.55),
    capsuleF(M.neck, T(0.9, 3.65, -0.9), 0.55, 0.5),
    capsuleF(T(0.9, 3.65, -0.9), M.umbo, 0.5, 0.36),
    capsuleF(T(0.0, -0.1, -2.0), M.umbo, 0.45, 0.6),
    capsuleF(T(0.9, 3.6, -0.9), T(0.95, 3.75, -0.2), 0.5, 0.18),
    capsuleF(T(0.7, 4.9, -1.6), M.anterior, 0.38, 0.14),
  ]);
}
export function incusField(): F3 {
  return smoothAll(0.25, [
    ellipsoidT(T(-2.6, 7.0, -3.4), [1.45, 1.95, 1.5]),
    capsuleF(T(-3.4, 7.0, -3.3), T(-6.3, 7.6, -3.0), 0.68, 0.3),
    capsuleF(T(-3.0, 6.2, -3.6), T(-3.1, 3.8, -3.4), 0.48, 0.38),
    capsuleF(T(-3.1, 3.8, -3.4), T(-2.7, 2.5, -3.3), 0.38, 0.3),
    capsuleF(T(-2.7, 2.5, -3.3), T(-2.62, 2.25, -3.7), 0.28, 0.4),
  ]);
}
export const STAPES = (() => {
  const s = vnorm(T(0.3, 0.2, 0.93));
  const head = T(-2.6, 1.9, -4.0);
  const W = vsub(head, vmul(s, 3.3));
  let L: V3 = vnorm(T(1, 0.12, -0.3));
  L = vnorm(vsub(L, vmul(s, L[0] * s[0] + L[1] * s[1] + L[2] * s[2])));
  return { s, head, W, L };
})();
export function stapesField(): F3 {
  const { s, head, W, L } = STAPES;
  const neckEnd = vsub(head, vmul(s, 0.8));
  const n1 = vsub(head, vmul(s, 1.1));
  const crus = (sg: number): F3[] => {
    const F = vadd(W, vmul(L, 1.1 * sg));
    const mid = vadd(vlerpV(n1, F, 0.5), vmul(L, 0.4 * sg));
    return [capsuleF(n1, mid, 0.24, 0.2), capsuleF(mid, F, 0.2, 0.22)];
  };
  const fp = ellipsoidFoot(W, L, s);
  return smoothAll(0.12, [sphereF(head, 0.52), capsuleF(head, neckEnd, 0.38, 0.28), capsuleF(neckEnd, n1, 0.28, 0.25), ...crus(1), ...crus(-1), fp]);
}
const vlerpV = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** Подножная пластинка: плоский эллипсоид с длинной осью L и нормалью s. */
function ellipsoidFoot(W: V3, L: V3, s: V3): F3 {
  const M: V3 = [L[1] * s[2] - L[2] * s[1], L[2] * s[0] - L[0] * s[2], L[0] * s[1] - L[1] * s[0]];
  const r: V3 = [1.55, 0.72, 0.13];
  return (x, y, z) => {
    const dx = x - W[0];
    const dy = y - W[1];
    const dz = z - W[2];
    const px = (dx * L[0] + dy * L[1] + dz * L[2]) / r[0];
    const py = (dx * M[0] + dy * M[1] + dz * M[2]) / r[1];
    const pz = (dx * s[0] + dy * s[1] + dz * s[2]) / r[2];
    const k0 = Math.hypot(px, py, pz);
    if (k0 < 1) return (k0 - 1) * r[2];
    const k1 = Math.hypot(px / r[0], py / r[1], pz / r[2]);
    return (k0 * (k0 - 1)) / (k1 || 1);
  };
}

