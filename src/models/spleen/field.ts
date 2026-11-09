import { Color } from 'three';
import { surfaceNets, type Grid } from '../teeth/surfaceNets';
import { AX_D, AX_L, AX_W, BODY, HILUM_HALF_LEN, fromLocal, hilumW, smoothstep, toLocal, visD, type V3 } from './anatomy';

/*
  Селезёнка как неявная поверхность (поле расстояний) в собственной системе (l, w, d):
  наружный эллипсоид минус «вырезающий» даёт выпуклую диафрагмальную и вогнутую внутренностную стороны;
  в поле вырезаны ворота (щель с губами), три вырезки верхнего края, отпечатки желудка, почки,
  ободочной кишки и хвоста поджелудочной; поверх — мягкая рябь капсулы. Поверхность делится на 10 частей по месту.
  Модуль не зависит от three.js-сцены и работает в воркере.
*/

export const REGIONS = [
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
] as const;
export type Region = (typeof REGIONS)[number];
const R = (r: Region) => REGIONS.indexOf(r);

const sstep = smoothstep;
const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);

function ell(l: number, w: number, d: number, c: V3, r: V3, k: number): number {
  const a = (l - c[0]) / r[0];
  const b = (w - c[1]) / r[1];
  const e = (d - c[2]) / r[2];
  return (Math.sqrt(a * a + b * b + e * e) - 1) * k;
}

/** Где проходит верхний (острый) край на данном l: вспомогательно для вырезок. */
export const rimW = (l: number): number => BODY.outer.r[1] * 0.93 * Math.sqrt(Math.max(0, 1 - (l / BODY.outer.r[0]) ** 2));

const IMPRINTS = [
  { l: 1.4, w: 2.1, rl: 2.9, rw: 1.8, depth: 0.34 }, // желудок
  { l: -2.5, w: -2.0, rl: 1.9, rw: 1.5, depth: 0.3 }, // почка
  { l: 4.3, w: -0.6, rl: 1.6, rw: 1.4, depth: 0.26 }, // ободочная кишка
  { l: 0.5, w: -1.35, rl: 1.5, rw: 0.75, depth: 0.22 }, // хвост поджелудочной железы
];

/* ---------- Шум ---------- */

function h31(ix: number, iy: number, iz: number, s: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 2147483647) ^ Math.imul(s, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x: number, y: number, z: number, s = 1): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fy = y - yi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  const a = (i: number, j: number, k: number) => h31(xi + i, yi + j, zi + k, s);
  const l = (p: number, q: number, t: number) => p + (q - p) * t;
  return l(l(l(a(0, 0, 0), a(1, 0, 0), u), l(a(0, 1, 0), a(1, 1, 0), u), v), l(l(a(0, 0, 1), a(1, 0, 1), u), l(a(0, 1, 1), a(1, 1, 1), u), v), w);
}

/* ---------- Поле ---------- */

/** Гладкая форма органа в местной системе (без ряби). */
export function spleenBase(l: number, w: number, d: number): number {
  const { outer, cut } = BODY;
  // верхний край острее: толщина к нему сжимается
  const thin = 1 + 0.22 * sstep(0.4, 3.8, w);
  const fo = ell(l, w, (d - outer.c[2]) * thin + outer.c[2], outer.c, outer.r, 2.6);
  const fc = ell(l, w, d, cut.c, cut.r, 4.2);
  let f = smax(fo, -fc, 0.32);

  const vm = 1 - sstep(-0.3, 1.0, d - visD(l, w)); // маска внутренностной стороны

  // ворота: щель вдоль внутренностной поверхности и валики-«губы»
  if (vm > 0 && Math.abs(l) < HILUM_HALF_LEN + 1.6) {
    const t = Math.min(1, Math.max(0, (l + HILUM_HALF_LEN) / (2 * HILUM_HALF_LEN)));
    const lc = -HILUM_HALF_LEN + t * 2 * HILUM_HALF_LEN;
    const wc = hilumW(lc);
    const dc = visD(lc, wc) - 0.05;
    const dist = Math.hypot(l - lc, w - wc, d - dc);
    const taper = 1 - 0.55 * (Math.abs(lc) / HILUM_HALF_LEN) ** 2;
    f = smax(f, -(dist - 0.56 * taper), 0.3);
    f -= 0.2 * Math.exp(-(((dist - 1.1) / 0.45) ** 2)) * vm * taper;
  }

  // отпечатки соседних органов
  for (const p of IMPRINTS) {
    const g = ((l - p.l) / p.rl) ** 2 + ((w - p.w) / p.rw) ** 2;
    if (g < 6) f += p.depth * Math.exp(-g) * vm;
  }

  // вырезки верхнего края
  for (const n of BODY.notches) {
    if (Math.abs(l - n.l) < n.r + 0.5 && w > 1.5) {
      const dn = Math.hypot(l - n.l, w - (rimW(n.l) - 0.12));
      f = smax(f, -(dn - n.r), 0.12);
    }
  }
  return f;
}

function field(l: number, w: number, d: number): number {
  const f = spleenBase(l, w, d);
  if (f > 0.6 || f < -0.6) return f;
  const wr = (vnoise(l * 0.9, w * 0.9, d * 0.9, 3) - 0.5) * 0.09 + (vnoise(l * 3.2, w * 3.2, d * 3.2, 9) - 0.5) * 0.03;
  return f + wr * (1 - sstep(0.3, 0.6, Math.abs(f)));
}

/** Расстояние до поверхности в мировых координатах (для проверки соседей и сосудов). */
export function spleenSdf(x: number, y: number, z: number): number {
  const [l, w, d] = toLocal([x, y, z]);
  return spleenBase(l, w, d);
}

/* ---------- Сетка ---------- */

export interface SpleenMeshData {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  /** l + 0.28 w: по ней проходят границы сегментов. */
  seg: Float32Array;
  indices: Record<Region, Uint32Array>;
}

function classify(l: number, w: number, nd: number): number {
  const lr = l / BODY.outer.r[0];
  if (lr > 0.74) return R('anterior-pole');
  if (lr < -0.74) return R('posterior-pole');
  if (w > 1.6 && nd < 0.7 && nd > -0.55) {
    for (const n of BODY.notches) if (Math.hypot(l - n.l, w - rimW(n.l)) < n.r + 0.5) return R('notches');
  }
  if (nd > 0.42) return R('diaphragmatic');
  if (nd < -0.3) {
    const dw = w - hilumW(l);
    if (Math.abs(dw) < 0.8 && Math.abs(l) < HILUM_HALF_LEN) return R('hilum');
    if (dw > 0) return R('gastric-surface');
    return l > 2.4 ? R('colic-surface') : R('renal-surface');
  }
  return w > 0 ? R('superior-border') : R('inferior-border');
}

const C_A = new Color('#8c3458');
const C_B = new Color('#a4486c');
const C_DARK = new Color('#6c2748');
const C_PALE = new Color('#c27a92');

export function buildSpleenMesh(h = 0.09): SpleenMeshData {
  const l0 = -7.0;
  const w0 = -5.0;
  const d0 = -4.6;
  const grid: Grid = { x0: l0, y0: w0, z0: d0, h, nx: Math.ceil(14.0 / h) + 1, ny: Math.ceil(10.0 / h) + 1, nz: Math.ceil(8.4 / h) + 1 };
  const { nx, ny, nz } = grid;
  const f = new Float32Array(nx * ny * nz);
  let o = 0;
  for (let k = 0; k < nz; k++) {
    const d = d0 + k * h;
    for (let j = 0; j < ny; j++) {
      const w = w0 + j * h;
      for (let i = 0; i < nx; i++) f[o++] = field(l0 + i * h, w, d);
    }
  }
  const mesh = surfaceNets(grid, f, 0);
  const lp = mesh.positions;
  const vn = lp.length / 3;

  const pos = new Float32Array(vn * 3);
  const nrm = new Float32Array(vn * 3);
  const col = new Float32Array(vn * 3);
  const seg = new Float32Array(vn);
  const label = new Uint8Array(vn);
  const c = new Color();
  const e = 0.05;
  for (let v = 0; v < vn; v++) {
    const l = lp[v * 3];
    const w = lp[v * 3 + 1];
    const d = lp[v * 3 + 2];
    let gl = field(l + e, w, d) - field(l - e, w, d);
    let gw = field(l, w + e, d) - field(l, w - e, d);
    let gd = field(l, w, d + e) - field(l, w, d - e);
    const len = Math.hypot(gl, gw, gd) || 1;
    gl /= len;
    gw /= len;
    gd /= len;
    const p = fromLocal(l, w, d);
    pos[v * 3] = p[0];
    pos[v * 3 + 1] = p[1];
    pos[v * 3 + 2] = p[2];
    nrm[v * 3] = AX_L[0] * gl + AX_W[0] * gw + AX_D[0] * gd;
    nrm[v * 3 + 1] = AX_L[1] * gl + AX_W[1] * gw + AX_D[1] * gd;
    nrm[v * 3 + 2] = AX_L[2] * gl + AX_W[2] * gw + AX_D[2] * gd;
    seg[v] = l + 0.28 * w;
    label[v] = classify(l, w, gd);

    // цвет: тёмный сливово-красный, пятнами светлее и темнее; вдоль ворот и краёв — чуть светлее (капсула толще)
    const n1 = vnoise(l * 0.55, w * 0.55, d * 0.55, 21);
    const n2 = vnoise(l * 1.9, w * 1.9, d * 1.9, 33);
    c.copy(C_A).lerp(C_B, n1);
    c.lerp(C_DARK, Math.max(0, n2 - 0.55) * 1.1);
    const pale = sstep(0.62, 0.86, vnoise(l * 0.8 + 4, w * 0.8, d * 0.8, 47)) * 0.45;
    c.lerp(C_PALE, pale);
    col[v * 3] = c.r;
    col[v * 3 + 1] = c.g;
    col[v * 3 + 2] = c.b;
  }

  const buckets: number[][] = REGIONS.map(() => []);
  const idx = mesh.indices;
  for (let t = 0; t < idx.length; t += 3) {
    const a = label[idx[t]];
    const b = label[idx[t + 1]];
    const cc = label[idx[t + 2]];
    const r = b === cc ? b : a;
    // Оси (l, w, d) образуют левую систему, поэтому преобразование отражает треугольники.
    buckets[r].push(idx[t], idx[t + 2], idx[t + 1]);
  }
  const indices = Object.fromEntries(REGIONS.map((r, i) => [r, new Uint32Array(buckets[i])])) as Record<Region, Uint32Array>;
  return { positions: pos, normals: nrm, colors: col, seg, indices };
}

export function spleenTransferables(d: SpleenMeshData): ArrayBuffer[] {
  return [d.positions.buffer, d.normals.buffer, d.colors.buffer, d.seg.buffer, ...Object.values(d.indices).map((a) => a.buffer)] as ArrayBuffer[];
}
