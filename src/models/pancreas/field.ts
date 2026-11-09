import { Color } from 'three';
import { surfaceNets, type Grid } from '../teeth/surfaceNets';
import {
  HEAD,
  NECK_END,
  SMV_PTS,
  SPLENIC_VEIN_PTS,
  SWEEP_FR,
  SWEEP_N,
  TAIL_START,
  TUBER,
  UNCINATE,
  halfAP,
  halfH,
  smoothstep,
  type V3,
} from './anatomy';

/*
  Железа как неявная поверхность (поле расстояний): головка, шея-тело-хвост (сечение меняется вдоль оси),
  крючковидный отросток и сальниковый бугор сливаются гладко; сосуды выдавливают в ней борозды;
  поверх — дольчатая поверхность (ячейки Вороного с щелями между дольками). Сетка строится в фоновом потоке.
  Эта часть не зависит от three.js-сцены и работает в воркере.
*/

export const REGIONS = ['head', 'uncinate', 'neck', 'omental-tuber', 'body', 'tail'] as const;
export type Region = (typeof REGIONS)[number];

const N = SWEEP_N;
const SP = new Float32Array((N + 1) * 3);
const ST = new Float32Array((N + 1) * 3);
const SN = new Float32Array((N + 1) * 3);
const SB = new Float32Array((N + 1) * 3);
const SA = new Float32Array(N + 1);
const SC = new Float32Array(N + 1);
for (let i = 0; i <= N; i++) {
  for (let k = 0; k < 3; k++) {
    SP[i * 3 + k] = SWEEP_FR.P[i * 3 + k];
    ST[i * 3 + k] = SWEEP_FR.T[i * 3 + k];
    SN[i * 3 + k] = SWEEP_FR.N[i * 3 + k];
    SB[i * 3 + k] = SWEEP_FR.B[i * 3 + k];
  }
  SA[i] = halfAP(i / N);
  SC[i] = halfH(i / N);
}

const sweepBox = (() => {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i <= N; i++)
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], SP[i * 3 + k]);
      hi[k] = Math.max(hi[k], SP[i * 3 + k]);
    }
  return { lo: lo.map((v) => v - 2.4), hi: hi.map((v) => v + 2.4) };
})();

const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);
const sstep = (a: number, b: number, x: number) => smoothstep(a, b, x);

/** Расстояние от точки до ломаной (через отрезки) — для борозд сосудов и крючковидного отростка. */
function segDist(px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number): { d: number; t: number } {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;
  const l2 = abx * abx + aby * aby + abz * abz || 1;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / l2));
  const dx = apx - abx * t;
  const dy = apy - aby * t;
  const dz = apz - abz * t;
  return { d: Math.sqrt(dx * dx + dy * dy + dz * dz), t };
}

/** Упрощённые ломаные для борозд: берём каждую вторую точку, чтобы поле считалось быстро. */
const thin = (pts: V3[], step = 2): V3[] => pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
const GROOVES: { pts: V3[]; r: number }[] = [
  { pts: thin(SMV_PTS.slice(-3), 1), r: 0.78 },
  { pts: thin(SPLENIC_VEIN_PTS.slice(0, -1), 1), r: 0.62 },
];

interface Eval {
  d: number;
  /** Отдел по ближайшей составной части (без дольчатости). */
  region: number;
}

const ev: Eval = { d: 0, region: 0 };

/** Гладкая форма железы без дольчатости. Записывает расстояние и отдел в ev. */
function base(x: number, y: number, z: number, wantRegion: boolean): Eval {
  // головка: суперэллипсоид, книзу немного сужается
  const hx = (x - HEAD.c[0]) / HEAD.r[0];
  const hy = (y - HEAD.c[1]) / HEAD.r[1];
  const hz = (z - HEAD.c[2]) / HEAD.r[2];
  const taper = 1 - 0.2 * Math.max(0, -hy);
  const q = HEAD.q;
  const hs = Math.pow(Math.pow(Math.abs(hx / taper), q) + Math.pow(Math.abs(hy), q) + Math.pow(Math.abs(hz), q), 1 / q);
  const dHead = (hs - 1) * 1.9;

  let dSweep = 9;
  let u = 0;
  if (x > sweepBox.lo[0] && x < sweepBox.hi[0] && y > sweepBox.lo[1] && y < sweepBox.hi[1] && z > sweepBox.lo[2] && z < sweepBox.hi[2]) {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i <= N; i++) {
      const dx = x - SP[i * 3];
      const dy = y - SP[i * 3 + 1];
      const dz = z - SP[i * 3 + 2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < bd) {
        bd = d2;
        bi = i;
      }
    }
    const vx = x - SP[bi * 3];
    const vy = y - SP[bi * 3 + 1];
    const vz = z - SP[bi * 3 + 2];
    const tt = vx * ST[bi * 3] + vy * ST[bi * 3 + 1] + vz * ST[bi * 3 + 2];
    const nn = vx * SN[bi * 3] + vy * SN[bi * 3 + 1] + vz * SN[bi * 3 + 2];
    const bb = vx * SB[bi * 3] + vy * SB[bi * 3 + 1] + vz * SB[bi * 3 + 2];
    // спереди железа выпуклая, сзади более плоская и тоньше
    const A = SA[bi] * (bb >= 0 ? 1.12 : 0.88);
    const C = SC[bi];
    const r = Math.sqrt((nn / C) ** 2 + (bb / A) ** 2 + (tt / 0.95) ** 2);
    dSweep = (r - 1) * Math.min(A, C);
    u = bi / N;
  }

  // крючковидный отросток: две капсулы, задняя сторона тоньше
  const zs = UNCINATE.zScale;
  let dUnc = 9;
  if (x > -5.6 && x < 1.0 && y > -5.6 && y < -2.4 && z > -4.4 && z < -0.4) {
    const p = UNCINATE.pts;
    for (let i = 0; i < 2; i++) {
      const s = segDist(x, y, z * zs, p[i][0], p[i][1], p[i][2] * zs, p[i + 1][0], p[i + 1][1], p[i + 1][2] * zs);
      const r = UNCINATE.r0 + (UNCINATE.r1 - UNCINATE.r0) * ((i + s.t) / 2);
      dUnc = Math.min(dUnc, s.d - r);
    }
  }

  const tdx = x - TUBER.c[0];
  const tdy = y - TUBER.c[1];
  const tdz = z - TUBER.c[2];
  const dTuber = Math.sqrt(tdx * tdx + tdy * tdy + tdz * tdz) - TUBER.r;

  let d = smin(smin(dHead, dSweep, 1.0), dUnc, 0.7);
  d = smin(d, dTuber, 0.55);

  // борозды сосудов позади железы
  if (d < 1.4) {
    for (const g of GROOVES) {
      let m = 9;
      for (let i = 0; i < g.pts.length - 1; i++) {
        const a = g.pts[i];
        const b = g.pts[i + 1];
        m = Math.min(m, segDist(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2]).d);
      }
      d = smax(d, -(m - g.r), 0.3);
    }
  }

  ev.d = d;
  if (wantRegion) {
    const m = Math.min(dHead, dSweep, dUnc, dTuber);
    ev.region =
      m === dHead ? 0 : m === dUnc ? 1 : m === dTuber ? 3 : u < NECK_END ? 2 : u < TAIL_START ? 4 : 5;
  }
  return ev;
}

/** Отметка u и расстояние для других модулей (разветвления междольковых протоков). */
export function glandSdf(x: number, y: number, z: number): number {
  return base(x, y, z, false).d;
}

/* ---------- Дольчатая поверхность ---------- */

function hash3(ix: number, iy: number, iz: number, s: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 2147483647) ^ Math.imul(s, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

interface Worley {
  f1: number;
  f2: number;
  id: number;
}
const wl: Worley = { f1: 0, f2: 0, id: 0 };

function worley(x: number, y: number, z: number, seed: number): Worley {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  let f1 = 9;
  let f2 = 9;
  let id = 0;
  for (let k = -1; k <= 1; k++)
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) {
        const cx = xi + i;
        const cy = yi + j;
        const cz = zi + k;
        const dx = cx + hash3(cx, cy, cz, seed) - x;
        const dy = cy + hash3(cx, cy, cz, seed + 1) - y;
        const dz = cz + hash3(cx, cy, cz, seed + 2) - z;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < f1) {
          f2 = f1;
          f1 = d;
          id = hash3(cx, cy, cz, seed + 3);
        } else if (d < f2) f2 = d;
      }
  wl.f1 = Math.sqrt(f1);
  wl.f2 = Math.sqrt(f2);
  wl.id = id;
  return wl;
}

const L1 = 1 / 0.85;
const L2 = 1 / 0.42;

/** Смещение поверхности: щели между дольками и выпуклые дольки двух размеров. */
function lobules(x: number, y: number, z: number): number {
  const a = worley(x * L1, y * L1, z * L1, 11);
  const groove = 1 - sstep(0.03, 0.2, a.f2 - a.f1);
  const knob = Math.min(1, a.f1);
  const b = worley(x * L2 + 5.3, y * L2 + 1.7, z * L2 + 9.1, 31);
  const groove2 = 1 - sstep(0.02, 0.16, b.f2 - b.f1);
  return 0.13 * groove + 0.1 * knob - 0.05 + 0.04 * groove2;
}

/** Полное поле: гладкая форма плюс дольчатость возле поверхности. */
function field(x: number, y: number, z: number): number {
  const d = base(x, y, z, false).d;
  if (d > 0.45 || d < -0.55) return d;
  return d + lobules(x, y, z) * (1 - sstep(0.3, 0.55, Math.abs(d + 0.05)));
}

/* ---------- Сетка ---------- */

export interface GlandMeshData {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Record<Region, Uint32Array>;
}

const C_BASE_A = new Color('#e5c394');
const C_BASE_B = new Color('#efd5b0');
const C_FAT = new Color('#f0d98c');
const C_CLEFT = new Color('#a97f58');
const C_PINK = new Color('#e2b79c');

export function buildGlandMesh(h = 0.1): GlandMeshData {
  const x0 = -8.0;
  const y0 = -5.6;
  const z0 = -4.3;
  const grid: Grid = { x0, y0, z0, h, nx: Math.ceil(20.2 / h) + 1, ny: Math.ceil(11.8 / h) + 1, nz: Math.ceil(6.4 / h) + 1 };
  const { nx, ny, nz } = grid;
  const f = new Float32Array(nx * ny * nz);
  let o = 0;
  for (let k = 0; k < nz; k++) {
    const z = z0 + k * h;
    for (let j = 0; j < ny; j++) {
      const y = y0 + j * h;
      for (let i = 0; i < nx; i++) f[o++] = field(x0 + i * h, y, z);
    }
  }
  const mesh = surfaceNets(grid, f, 0);
  const pos = mesh.positions;
  const vn = pos.length / 3;

  // нормали — градиент поля в самой вершине (гладче, чем по ячейкам)
  const nrm = new Float32Array(vn * 3);
  const e = 0.05;
  for (let v = 0; v < vn; v++) {
    const x = pos[v * 3];
    const y = pos[v * 3 + 1];
    const z = pos[v * 3 + 2];
    let gx = field(x + e, y, z) - field(x - e, y, z);
    let gy = field(x, y + e, z) - field(x, y - e, z);
    let gz = field(x, y, z + e) - field(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    gx /= l;
    gy /= l;
    gz /= l;
    nrm[v * 3] = gx;
    nrm[v * 3 + 1] = gy;
    nrm[v * 3 + 2] = gz;
  }

  // цвет: тёплый кремовый тон, у каждой дольки свой оттенок, щели темнее, редкие жировые вкрапления
  const col = new Float32Array(vn * 3);
  const label = new Uint8Array(vn);
  const c = new Color();
  for (let v = 0; v < vn; v++) {
    const x = pos[v * 3];
    const y = pos[v * 3 + 1];
    const z = pos[v * 3 + 2];
    const a = worley(x * L1, y * L1, z * L1, 11);
    const groove = 1 - sstep(0.02, 0.3, a.f2 - a.f1);
    c.copy(C_BASE_A).lerp(C_BASE_B, a.id);
    if (a.id > 0.84) c.lerp(C_FAT, 0.55);
    else if (a.id < 0.16) c.lerp(C_PINK, 0.4);
    c.lerp(C_CLEFT, groove * 0.38);
    col[v * 3] = c.r;
    col[v * 3 + 1] = c.g;
    col[v * 3 + 2] = c.b;
    label[v] = base(x, y, z, true).region;
  }

  const buckets: number[][] = REGIONS.map(() => []);
  const idx = mesh.indices;
  for (let t = 0; t < idx.length; t += 3) {
    const a = label[idx[t]];
    const b = label[idx[t + 1]];
    const cc = label[idx[t + 2]];
    const r = b === cc ? b : a;
    buckets[r].push(idx[t], idx[t + 1], idx[t + 2]);
  }
  const indices = Object.fromEntries(REGIONS.map((r, i) => [r, new Uint32Array(buckets[i])])) as Record<Region, Uint32Array>;
  return { positions: pos, normals: nrm, colors: col, indices };
}

export function glandTransferables(d: GlandMeshData): ArrayBuffer[] {
  return [d.positions.buffer, d.normals.buffer, d.colors.buffer, ...Object.values(d.indices).map((a) => a.buffer)] as ArrayBuffer[];
}
