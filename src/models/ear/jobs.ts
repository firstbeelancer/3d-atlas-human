/** Задания на построение сеток уха: одни и те же функции работают в фоновом потоке и в тестах. */
import { surfaceNets, type Grid, type MeshData } from '../teeth/surfaceNets';
import { EAR_N, EAR_P, EAR_Q, T, ear, type V3 } from './anatomy';
import {
  AURICLE_REGIONS, AIR_REGIONS, BONE_REGIONS, airField, airRegion, auricleCartilage, auricleSkin, boneField, boneRegion, incusField, malleusField, skinRegion, skinShade, stapesField,
  type Box, type F3,
} from './field';

export interface EarMesh extends MeshData {
  /** Затенение углублений (три компоненты на вершину). */
  colors?: Float32Array;
  /** Метка области на каждый треугольник. */
  tri?: Uint8Array;
}

export type EarJob = { type: 'auricle' | 'cartilage' | 'bone' | 'air' | 'malleus' | 'incus' | 'stapes'; q: number };
export const jobKey = (j: EarJob): string => j.type;

function makeGrid(box: Box, h: number): Grid {
  const pad = 2 * h;
  return {
    x0: box[0] - pad,
    y0: box[1] - pad,
    z0: box[2] - pad,
    h,
    nx: Math.ceil((box[3] - box[0] + 2 * pad) / h) + 1,
    ny: Math.ceil((box[4] - box[1] + 2 * pad) / h) + 1,
    nz: Math.ceil((box[5] - box[2] + 2 * pad) / h) + 1,
  };
}

function sample(g: Grid, f: F3): Float32Array {
  const out = new Float32Array(g.nx * g.ny * g.nz);
  let n = 0;
  for (let k = 0; k < g.nz; k++) {
    const z = g.z0 + k * g.h;
    for (let j = 0; j < g.ny; j++) {
      const y = g.y0 + j * g.h;
      for (let i = 0; i < g.nx; i++) out[n++] = f(g.x0 + i * g.h, y, z);
    }
  }
  return out;
}

/** Ньютоновская подгонка вершин к поверхности и аналитические нормали. */
function refine(m: MeshData, f: F3, eps: number, maxStep: number): void {
  const p = m.positions;
  const nrm = m.normals;
  const n = p.length / 3;
  for (let v = 0; v < n; v++) {
    const x = p[v * 3];
    const y = p[v * 3 + 1];
    const z = p[v * 3 + 2];
    const d = f(x, y, z);
    const gx = (f(x + eps, y, z) - f(x - eps, y, z)) / (2 * eps);
    const gy = (f(x, y + eps, z) - f(x, y - eps, z)) / (2 * eps);
    const gz = (f(x, y, z + eps) - f(x, y, z - eps)) / (2 * eps);
    const l2 = gx * gx + gy * gy + gz * gz;
    if (l2 > 1e-8) {
      const l = Math.sqrt(l2);
      let s = d / l2;
      const mag = Math.abs(d / l);
      if (mag > maxStep) s *= maxStep / mag;
      p[v * 3] = x - gx * s;
      p[v * 3 + 1] = y - gy * s;
      p[v * 3 + 2] = z - gz * s;
      nrm[v * 3] = gx / l;
      nrm[v * 3 + 1] = gy / l;
      nrm[v * 3 + 2] = gz / l;
    }
  }
}

function meshOf(box: Box, h: number, f: F3, eps: number): EarMesh {
  const g = makeGrid(box, h);
  const m = surfaceNets(g, sample(g, f)) as EarMesh;
  refine(m, f, eps, h * 0.8);
  return m;
}

/** Коробка в голове по коробке в системе перепонки (углы переводятся и берётся охватывающая). */
function tmBox(a0: number, a1: number, u0: number, u1: number, d0: number, d1: number): Box {
  const lo: V3 = [Infinity, Infinity, Infinity];
  const hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (const a of [a0, a1])
    for (const u of [u0, u1])
      for (const d of [d0, d1]) {
        const p = T(a, u, d);
        for (let i = 0; i < 3; i++) {
          lo[i] = Math.min(lo[i], p[i]);
          hi[i] = Math.max(hi[i], p[i]);
        }
      }
  return [lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]];
}

const EAR_BOX: Box = [-14.5, -37, -19, 22, 36, 27];

/** Из сетки в ушных координатах (x, p, q) — в систему головы. */
function earToHead(m: EarMesh): void {
  const P = m.positions;
  const N = m.normals;
  for (let v = 0; v < P.length / 3; v++) {
    const w = ear(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
    const nx = N[v * 3];
    const np = N[v * 3 + 1];
    const nq = N[v * 3 + 2];
    P[v * 3] = w[0];
    P[v * 3 + 1] = w[1];
    P[v * 3 + 2] = w[2];
    N[v * 3] = nx * EAR_N[0] + np * EAR_P[0] + nq * EAR_Q[0];
    N[v * 3 + 1] = nx * EAR_N[1] + np * EAR_P[1] + nq * EAR_Q[1];
    N[v * 3 + 2] = nx * EAR_N[2] + np * EAR_P[2] + nq * EAR_Q[2];
  }
}

function labelTriangles(m: EarMesh, label: (cx: number, cy: number, cz: number, nx: number, ny: number, nz: number) => number): void {
  const idx = m.indices;
  const p = m.positions;
  const n = m.normals;
  const nt = idx.length / 3;
  const tri = new Uint8Array(nt);
  for (let t = 0; t < nt; t++) {
    const a = idx[t * 3] * 3;
    const b = idx[t * 3 + 1] * 3;
    const c = idx[t * 3 + 2] * 3;
    tri[t] = label(
      (p[a] + p[b] + p[c]) / 3, (p[a + 1] + p[b + 1] + p[c + 1]) / 3, (p[a + 2] + p[b + 2] + p[c + 2]) / 3,
      n[a] + n[b] + n[c], n[a + 1] + n[b + 1] + n[c + 1], n[a + 2] + n[b + 2] + n[c + 2],
    );
  }
  m.tri = tri;
}

function buildAuricle(q: number): EarMesh {
  const m = meshOf(EAR_BOX, 0.32 * q, auricleSkin(), 0.12);
  const n = m.positions.length / 3;
  const col = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const ao = skinShade(m.positions[v * 3], m.positions[v * 3 + 1], m.positions[v * 3 + 2]);
    col[v * 3] = ao;
    col[v * 3 + 1] = ao * 0.985;
    col[v * 3 + 2] = ao * 0.97;
  }
  m.colors = col;
  labelTriangles(m, (x, p, qq, nx) => skinRegion(x, p, qq, nx / 3));
  earToHead(m);
  return m;
}

function buildCartilage(q: number): EarMesh {
  const m = meshOf(EAR_BOX, 0.3 * q, auricleCartilage(), 0.12);
  earToHead(m);
  return m;
}

export function runJob(job: EarJob): EarMesh {
  const q = job.q;
  switch (job.type) {
    case 'auricle':
      return buildAuricle(q);
    case 'cartilage':
      return buildCartilage(q);
    case 'bone': {
      const m = meshOf([-36, -37, -26, 18, 26, 28], 0.42 * q, boneField(), 0.2);
      labelTriangles(m, (x, y, z) => boneRegion(x, y, z));
      return m;
    }
    case 'air': {
      const m = meshOf(tmBox(-17.5, 7.5, -9.5, 12.5, -8.5, 1.8), 0.28 * q, airField(), 0.12);
      labelTriangles(m, (x, y, z) => airRegion(x, y, z));
      return m;
    }
    case 'malleus':
      return meshOf(tmBox(-1.8, 4.2, -1.4, 9.0, -4.6, 0.9), 0.085 * q, malleusField(), 0.04);
    case 'incus':
      return meshOf(tmBox(-7.2, -0.8, 1.2, 9.4, -5.4, -1.2), 0.085 * q, incusField(), 0.04);
    case 'stapes':
      return meshOf(tmBox(-6.2, 0.6, -1.6, 3.6, -8.6, -2.8), 0.07 * q, stapesField(), 0.03);
  }
}

export function transferables(m: EarMesh): ArrayBuffer[] {
  const out: ArrayBuffer[] = [m.positions.buffer as ArrayBuffer, m.normals.buffer as ArrayBuffer, m.indices.buffer as ArrayBuffer];
  if (m.colors) out.push(m.colors.buffer as ArrayBuffer);
  if (m.tri) out.push(m.tri.buffer as ArrayBuffer);
  return out;
}

/** Полный список заданий: тяжёлые — первыми, чтобы пул потоков загружался равномерно. */
export function allJobs(q: number): EarJob[] {
  return (['bone', 'auricle', 'cartilage', 'air', 'malleus', 'incus', 'stapes'] as const).map((type) => ({ type, q }));
}

export { AURICLE_REGIONS, AIR_REGIONS, BONE_REGIONS };
