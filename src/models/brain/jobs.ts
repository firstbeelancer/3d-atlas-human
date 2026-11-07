/** Задания на построение сеток и объёмов мозга: одни и те же функции работают в фоновом потоке и в тестах. */
import { surfaceNets, type Grid, type MeshData } from '../teeth/surfaceNets';
import {
  STRUCTS,
  STRUCT_BY_ID,
  amygdalaField,
  baseCerebellum,
  baseHemi,
  callosumField,
  caudateField,
  cerebellumField,
  envelopeField,
  fornixField,
  fourthVentricleField,
  hemiField,
  hippocampusField,
  hypothalamusField,
  lateralVentricleField,
  lobeAt,
  mammillaryField,
  noise3,
  pallidusField,
  putamenField,
  stemField,
  stemLabel,
  thalamusField,
  thirdVentricleField,
  zonesAt,
  type Box,
} from './field';

export interface BrainMesh extends MeshData {
  /** Затенение углублений (серый множитель на вершину, три компоненты). */
  colors?: Float32Array;
  /** Метка на каждый треугольник: доля (кора) или отдел ствола. */
  tri?: Uint8Array;
  /** Битовая маска зон на каждый треугольник. */
  zone?: Uint16Array;
}

export interface Volume {
  data: Uint8Array;
  dims: [number, number, number];
  min: [number, number, number];
  h: number;
}

export type BrainJob =
  | { type: 'hemi'; side: 1 | -1; q: number }
  | { type: 'cerebellum'; q: number }
  | { type: 'stem'; q: number }
  | { type: 'struct'; id: string; q: number }
  | { type: 'shell'; id: 'arachnoid' | 'dura'; q: number }
  | { type: 'volC'; q: number }
  | { type: 'volB'; q: number };

export interface BrainResult {
  mesh?: BrainMesh;
  vol?: Volume;
}

/** Диапазон расстояний, кодируемый в байт (±мм). */
export const VOL_RANGE = 8;

type F3 = (x: number, y: number, z: number) => number;

const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function makeGrid(box: Box, h: number): Grid {
  const pad = 2 * h;
  const x0 = box[0] - pad;
  const y0 = box[1] - pad;
  const z0 = box[2] - pad;
  return {
    x0,
    y0,
    z0,
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

/** Ньютоновская подгонка вершин к поверхности и аналитические нормали (градиент поля). */
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

function meshOf(box: Box, h: number, f: F3, refineEps: number): BrainMesh {
  const g = makeGrid(box, h);
  const m = surfaceNets(g, sample(g, f)) as BrainMesh;
  refine(m, f, refineEps, h * 0.8);
  return m;
}

function labelTriangles(m: BrainMesh, centroid: (x: number, y: number, z: number) => [number, number]): void {
  const idx = m.indices;
  const p = m.positions;
  const nt = idx.length / 3;
  const tri = new Uint8Array(nt);
  const zone = new Uint16Array(nt);
  for (let t = 0; t < nt; t++) {
    const a = idx[t * 3] * 3;
    const b = idx[t * 3 + 1] * 3;
    const c = idx[t * 3 + 2] * 3;
    const [l, zz] = centroid((p[a] + p[b] + p[c]) / 3, (p[a + 1] + p[b + 1] + p[c + 1]) / 3, (p[a + 2] + p[b + 2] + p[c + 2]) / 3);
    tri[t] = l;
    zone[t] = zz;
  }
  m.tri = tri;
  m.zone = zone;
}

function buildHemi(side: 1 | -1, q: number): BrainMesh {
  const box: Box = side > 0 ? [0, -46, -90, 78, 62, 88] : [-78, -46, -90, 0, 62, 88];
  const f: F3 = (x, y, z) => hemiField(x, y, z, side);
  const m = meshOf(box, 1.0 * q, f, 0.45);
  const n = m.positions.length / 3;
  const col = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const x = m.positions[v * 3];
    const y = m.positions[v * 3 + 1];
    const z = m.positions[v * 3 + 2];
    const lx = side * x;
    const depth = -baseHemi(lx, y, z);
    let ao = 1 - 0.68 * sstep(0.35, 5.2, depth);
    if (lx < 1.6) ao *= 0.86;
    const tint = 0.035 * noise3(x / 24 + 4, y / 24, z / 24);
    col[v * 3] = ao * (1 + tint);
    col[v * 3 + 1] = ao;
    col[v * 3 + 2] = ao * (1 - tint);
  }
  m.colors = col;
  labelTriangles(m, (x, y, z) => [lobeAt(side * x, y, z), zonesAt(side * x, y, z, side)]);
  return m;
}

function buildCerebellum(q: number): BrainMesh {
  const m = meshOf([-62, -82, -94, 62, -22, -28], 0.62 * q, cerebellumField, 0.3);
  const n = m.positions.length / 3;
  const col = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const depth = -baseCerebellum(m.positions[v * 3], m.positions[v * 3 + 1], m.positions[v * 3 + 2]);
    const ao = 1 - 0.55 * sstep(0.15, 3.8, depth);
    col[v * 3] = ao;
    col[v * 3 + 1] = ao;
    col[v * 3 + 2] = ao;
  }
  m.colors = col;
  labelTriangles(m, (x) => [0, Math.abs(x) < 9 ? 1 : 0]);
  return m;
}

function buildStem(q: number): BrainMesh {
  const m = meshOf([-30, -116, -56, 30, -10, 10], 0.65 * q, stemField, 0.3);
  labelTriangles(m, (x, y, z) => [stemLabel(x, y, z), 0]);
  return m;
}

function buildShell(id: 'arachnoid' | 'dura', q: number): BrainMesh {
  const off = id === 'arachnoid' ? 1.9 : 7;
  const h = (id === 'arachnoid' ? 1.5 : 2.4) * q;
  return meshOf([-86, -112, -104, 86, 70, 96], h, (x, y, z) => envelopeField(x, y, z) - off, 0.8);
}

/** Объём для срезов: четыре канала расстояний, закодированные в байты. */
function volume(box: Box, h: number, chans: [F3, F3, F3, F3], bounds: (Box | null)[]): Volume {
  const nx = Math.ceil((box[3] - box[0]) / h);
  const ny = Math.ceil((box[4] - box[1]) / h);
  const nz = Math.ceil((box[5] - box[2]) / h);
  const data = new Uint8Array(nx * ny * nz * 4);
  const enc = (d: number) => {
    const t = d / VOL_RANGE;
    return Math.round((t < -1 ? -1 : t > 1 ? 1 : t) * 127.5 + 127.5);
  };
  let o = 0;
  for (let k = 0; k < nz; k++) {
    const z = box[2] + (k + 0.5) * h;
    for (let j = 0; j < ny; j++) {
      const y = box[1] + (j + 0.5) * h;
      for (let i = 0; i < nx; i++) {
        const x = box[0] + (i + 0.5) * h;
        for (let c = 0; c < 4; c++) {
          const b = bounds[c];
          if (b) {
            const dx = Math.max(b[0] - x, 0, x - b[3]);
            const dy = Math.max(b[1] - y, 0, y - b[4]);
            const dz = Math.max(b[2] - z, 0, z - b[5]);
            if (dx > 0 || dy > 0 || dz > 0) {
              data[o++] = 255;
              continue;
            }
          }
          data[o++] = enc(chans[c](x, y, z));
        }
      }
    }
  }
  return { data, dims: [nx, ny, nz], min: [box[0], box[1], box[2]], h };
}

const bx = (ids: string[], pad = 8): Box => {
  const b: Box = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (const id of ids) {
    const s = STRUCT_BY_ID[id].box;
    for (let i = 0; i < 3; i++) {
      b[i] = Math.min(b[i], s[i] - pad);
      b[i + 3] = Math.max(b[i + 3], s[i + 3] + pad);
    }
  }
  return b;
};

function buildVolC(q: number): Volume {
  const nuclei: F3 = (x, y, z) =>
    Math.min(thalamusField(x, y, z), hypothalamusField(x, y, z), caudateField(x, y, z), putamenField(x, y, z), pallidusField(x, y, z), amygdalaField(x, y, z), hippocampusField(x, y, z), mammillaryField(x, y, z));
  const vent: F3 = (x, y, z) => Math.min(lateralVentricleField(x, y, z), thirdVentricleField(x, y, z));
  const tracts: F3 = (x, y, z) => Math.min(callosumField(x, y, z), fornixField(x, y, z));
  return volume(
    [-72, -46, -90, 72, 62, 86],
    1.0 * q,
    [(x, y, z) => hemiField(x, y, z, x >= 0 ? 1 : -1), vent, nuclei, tracts],
    [null, bx(['lateral-ventricles', 'third-ventricle']), bx(['thalamus', 'hypothalamus', 'caudate-nucleus', 'putamen', 'globus-pallidus', 'amygdala', 'hippocampus', 'mammillary-bodies']), bx(['corpus-callosum', 'fornix'])],
  );
}

function buildVolB(q: number): Volume {
  const vent: F3 = (x, y, z) => Math.min(fourthVentricleField(x, y, z), thirdVentricleField(x, y, z));
  return volume(
    [-60, -114, -94, 60, -16, -2],
    0.8 * q,
    [cerebellumField, stemField, vent, () => 99],
    [[-66, -88, -100, 66, -18, -22], null, bx(['fourth-ventricle', 'third-ventricle']), null],
  );
}

export function runJob(job: BrainJob): BrainResult {
  switch (job.type) {
    case 'hemi':
      return { mesh: buildHemi(job.side, job.q) };
    case 'cerebellum':
      return { mesh: buildCerebellum(job.q) };
    case 'stem':
      return { mesh: buildStem(job.q) };
    case 'struct': {
      const s = STRUCT_BY_ID[job.id];
      return { mesh: meshOf(s.box, s.h * job.q, s.sdf, s.h * 0.5) };
    }
    case 'shell':
      return { mesh: buildShell(job.id, job.q) };
    case 'volC':
      return { vol: buildVolC(job.q) };
    case 'volB':
      return { vol: buildVolB(job.q) };
  }
}

export function transferables(r: BrainResult): ArrayBuffer[] {
  const out: ArrayBuffer[] = [];
  if (r.mesh) {
    const m = r.mesh;
    out.push(m.positions.buffer as ArrayBuffer, m.normals.buffer as ArrayBuffer, m.indices.buffer as ArrayBuffer);
    if (m.colors) out.push(m.colors.buffer as ArrayBuffer);
    if (m.tri) out.push(m.tri.buffer as ArrayBuffer);
    if (m.zone) out.push(m.zone.buffer as ArrayBuffer);
  }
  if (r.vol) out.push(r.vol.data.buffer as ArrayBuffer);
  return out;
}

/** Полный список заданий: тяжёлые — первыми, чтобы пул потоков загружался равномерно. */
export function allJobs(q: number): BrainJob[] {
  return [
    { type: 'hemi', side: 1, q },
    { type: 'hemi', side: -1, q },
    { type: 'volC', q },
    { type: 'cerebellum', q },
    { type: 'volB', q },
    { type: 'shell', id: 'dura', q },
    { type: 'shell', id: 'arachnoid', q },
    { type: 'stem', q },
    ...STRUCTS.map((s) => ({ type: 'struct' as const, id: s.id, q })),
  ];
}

export function jobKey(j: BrainJob): string {
  return j.type + ('id' in j ? `:${j.id}` : '') + ('side' in j ? `:${j.side}` : '');
}
