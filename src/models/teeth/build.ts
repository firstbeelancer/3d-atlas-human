/**
 * Сборка сеток зуба из неявных полей: эмаль, дентин, пульпа, цемент, каналы — каждый слой
 * замкнутое тело, поэтому на разрезе видны настоящие срезы тканей, а не пустые оболочки.
 */
import { makeToothField, type ToothField, type ToothSpec } from './anatomy';
import { smax, smin, smoothstep } from './sdf';
import { smoothMesh, surfaceNets, type Grid, type MeshData } from './surfaceNets';

export const TOOTH_LAYERS = ['enamel', 'dentin', 'pulp', 'cementum', 'canal'] as const;
export type ToothLayer = (typeof TOOTH_LAYERS)[number];

export interface LayerMesh extends MeshData {
  /** Цвет вершин (эмаль светлее на буграх и желтее у шейки, где просвечивает дентин). */
  colors?: Float32Array;
}

export interface BuildOpts {
  /** Шаг сетки (меньше — детальнее и тяжелее). */
  step: number;
  /** Поворот зуба вокруг вертикали перед разрезом (радианы). */
  yaw?: number;
  /** Разрез плоскостью z = cutZ (в повёрнутых координатах); остаётся часть z < cutZ. */
  cutZ?: number | null;
  /** Какие слои собирать. */
  layers?: readonly ToothLayer[];
}

export interface Sampler {
  /** Поля в точке повёрнутого пространства: внешнее (нормированное), граница эмали/цемента и пульпа. */
  at(x: number, y: number, z: number, out: Float64Array): void;
}

/** Нормированное поле зуба: делим на длину градиента, чтобы отступы (толщина эмали) были в настоящих единицах. */
export function toothSampler(f: ToothField, yaw = 0): Sampler {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const { spec } = f;
  const e = 0.004;
  return {
    at(xd, y, zd, out) {
      // поворот в систему координат зуба
      const x = c * xd - s * zd;
      const z = s * xd + c * zd;
      let t = f.outer(x, y, z);
      if (t < 0.6 && t > -0.5) {
        const gx = f.outer(x + e, y, z) - f.outer(x - e, y, z);
        const gy = f.outer(x, y + e, z) - f.outer(x, y - e, z);
        const gz = f.outer(x, y, z + e) - f.outer(x, y, z - e);
        const g = Math.sqrt(gx * gx + gy * gy + gz * gz) / (2 * e);
        if (g > 0.2) t /= g;
      }
      const sh = f.shell(x, y, z);
      const d = t + sh;
      const pulp = smin(smax(t + spec.pulpDepth, spec.chamberFloor - 0.02 - y, 0.05), f.canals(x, y, z), 0.05);
      out[0] = t;
      out[1] = d;
      out[2] = pulp;
      out[3] = f.cej(x, z);
      out[4] = sh;
    },
  };
}

export function gridFor(min: number[], max: number[], step: number): Grid {
  const pad = step * 2;
  // смещение на полшага: плоскость разреза z = 0 не совпадает с узлами сетки
  const x0 = Math.floor((min[0] - pad) / step) * step + step * 0.5;
  const y0 = Math.floor((min[1] - pad) / step) * step + step * 0.5;
  const z0 = Math.floor((min[2] - pad) / step) * step + step * 0.5;
  return {
    x0, y0, z0, h: step,
    nx: Math.ceil((max[0] + pad - x0) / step) + 1,
    ny: Math.ceil((max[1] + pad - y0) / step) + 1,
    nz: Math.ceil((max[2] + pad - z0) / step) + 1,
  };
}

/** Габариты повёрнутого зуба. */
function rotatedBox(f: ToothField, yaw: number): { min: number[]; max: number[] } {
  const { min, max } = f.box;
  const r = Math.max(Math.abs(min[0]), Math.abs(max[0]), Math.abs(min[2]), Math.abs(max[2]));
  if (!yaw) return { min: [...min], max: [...max] };
  return { min: [-r, min[1], -r], max: [r, max[1], r] };
}

/**
 * Заполняет поля на сетке. Быстрый путь: сначала грубые блоки 4x4x4 (далеко снаружи — пропуск),
 * затем внешнее поле в узлах и нормировка по градиенту, посчитанному по самой сетке.
 */
export function sampleTooth(
  f: ToothField,
  g: Grid,
  yaw: number,
  T: Float32Array,
  D: Float32Array,
  Pf: Float32Array,
  C: Float32Array,
  Tn?: Float32Array,
): void {
  const { nx, ny, nz, h } = g;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const spec = f.spec;
  const B = 4;
  const far = h * B * 1.8 + 0.03;
  T.fill(1);
  for (let bk = 0; bk < nz; bk += B)
    for (let bj = 0; bj < ny; bj += B)
      for (let bi = 0; bi < nx; bi += B) {
        const xc = g.x0 + (bi + B / 2) * h;
        const yc = g.y0 + (bj + B / 2) * h;
        const zc = g.z0 + (bk + B / 2) * h;
        const v = f.outer(cy * xc - sy * zc, yc, sy * xc + cy * zc);
        if (v > far) continue;
        const deep = v < -far - 0.42;
        for (let k = bk; k < Math.min(bk + B, nz); k++) {
          const z = g.z0 + k * h;
          for (let j = bj; j < Math.min(bj + B, ny); j++) {
            const y = g.y0 + j * h;
            let p = bi + nx * (j + ny * k);
            for (let i = bi; i < Math.min(bi + B, nx); i++, p++) {
              if (deep) {
                T[p] = v;
                continue;
              }
              const x = g.x0 + i * h;
              T[p] = f.outer(cy * x - sy * z, y, sy * x + cy * z);
            }
          }
        }
      }
  const sx = 1;
  const syy = nx;
  const sz = nx * ny;
  const raw = T;
  let p = 0;
  for (let k = 0; k < nz; k++) {
    const z = g.z0 + k * h;
    for (let j = 0; j < ny; j++) {
      const y = g.y0 + j * h;
      for (let i = 0; i < nx; i++, p++) {
        let t = T[p];
        if (t > 0.08 || i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1) {
          D[p] = t;
          Pf[p] = t + 0.3;
          C[p] = 0;
          if (Tn) Tn[p] = t;
          continue;
        }
        const gx = raw[p + sx] - raw[p - sx];
        const gy = raw[p + syy] - raw[p - syy];
        const gz = raw[p + sz] - raw[p - sz];
        const gl = Math.sqrt(gx * gx + gy * gy + gz * gz) / (2 * h);
        if (gl > 0.2 && t > -0.6) t /= gl;
        const x = g.x0 + i * h;
        const lx = cy * x - sy * z;
        const lz = sy * x + cy * z;
        const sh = f.shell(lx, y, lz);
        D[p] = t + sh;
        C[p] = f.cej(lx, lz);
        let pulp = smax(t + spec.pulpDepth, spec.chamberFloor - 0.02 - y, 0.05);
        if (t < -0.02 && y < spec.chamberFloor + 0.25) pulp = smin(pulp, f.canals(lx, y, lz), 0.05);
        Pf[p] = pulp;
        if (Tn) Tn[p] = t;
      }
    }
  }
}

export type LayerSet<K extends string = string> = Partial<Record<K, LayerMesh>>;

/** Целый зуб и он же в разрезе: одно и то же поле, разные срезы. */
export interface ToothBuild {
  full: LayerSet<ToothLayer>;
  cut: LayerSet<ToothLayer>;
}

/** Поле одного слоя зуба в узле p (без плоскости разреза). */
export function toothLayerValue(
  layer: ToothLayer, p: number, y: number, ySplit: number,
  T: Float32Array, D: Float32Array, Pf: Float32Array, C: Float32Array,
): number {
  switch (layer) {
    case 'enamel':
      return Math.max(T[p], -D[p], C[p] - y, -Pf[p]);
    case 'cementum':
      // заходит под край эмали (материал цемента сдвинут назад по глубине): на ЭЦГ нет щели
      {
      // над ЭЦГ цемент утоплен под эмаль на 0,06 мм — сетки не пересекаются
      const sink = 0.006 * Math.min(1, Math.max(0, (y - C[p] + 0.004) / 0.012));
      return Math.max(T[p] + sink, -D[p], y - C[p] - 0.03, -Pf[p]);
    }
    case 'dentin':
      return Math.max(D[p], -Pf[p]);
    case 'pulp':
      return Math.max(Pf[p], ySplit - y);
    case 'canal':
      // каналы заходят в камеру и чуть утоплены: на стыке нет щели и мерцания
      return Math.max(Pf[p] + 0.004, y - ySplit - 0.05);
  }
}

/** Собирает сетку слоя по функции значения в узле; cutZ — плоскость разреза (или null). */
export function meshLayer(g: Grid, value: (p: number, y: number) => number, cutZ: number | null, field: Float32Array): MeshData {
  let p = 0;
  for (let k = 0; k < g.nz; k++) {
    const z = g.z0 + k * g.h;
    const cut = cutZ === null ? -1e9 : z - cutZ;
    for (let j = 0; j < g.ny; j++) {
      const y = g.y0 + j * g.h;
      for (let i = 0; i < g.nx; i++, p++) {
        const v = value(p, y);
        field[p] = v > cut ? v : cut;
      }
    }
  }
  return smoothMesh(surfaceNets(g, field));
}

/** Слои, которые заходят под соседний (канал под пульпу, цемент под эмаль), режем чуть глубже, чтобы срезы не мерцали. */
export function insetCut(layer: string, cutZ: number | null): number | null {
  if (cutZ === null) return null;
  return layer === 'canal' || layer === 'cementum' ? cutZ - 0.003 : cutZ;
}

export function buildTooth(spec: ToothSpec, o: BuildOpts): ToothBuild {
  const f = makeToothField(spec);
  const yaw = o.yaw ?? 0;
  const sampler = toothSampler(f, yaw);
  const box = rotatedBox(f, yaw);
  const g = gridFor(box.min, box.max, o.step);
  const N = g.nx * g.ny * g.nz;
  const T = new Float32Array(N);
  const D = new Float32Array(N);
  const Pf = new Float32Array(N);
  const C = new Float32Array(N);
  sampleTooth(f, g, yaw, T, D, Pf, C);
  const field = new Float32Array(N);
  const layers = o.layers ?? TOOTH_LAYERS;
  const res: ToothBuild = { full: {}, cut: {} };
  for (const variant of ['full', 'cut'] as const) {
    const cutZ = variant === 'cut' ? (o.cutZ ?? 0) : null;
    for (const layer of layers) {
      const mesh: LayerMesh = meshLayer(g, (p, y) => toothLayerValue(layer, p, y, spec.chamberFloor, T, D, Pf, C), insetCut(layer, cutZ), field);
      if (mesh.indices.length === 0) continue;
      if (layer === 'enamel') mesh.colors = enamelColors(mesh.positions, sampler, spec);
      res[variant][layer] = mesh;
    }
  }
  return res;
}

/** Цвет эмали: тонкая у шейки (просвечивает жёлтый дентин), толстая на буграх, голубоватая на режущем крае. */
export function enamelColors(pos: Float32Array, s: Sampler, spec: ToothSpec): Float32Array {
  const col = new Float32Array(pos.length);
  const tmp = new Float64Array(5);
  for (let i = 0; i < pos.length; i += 3) {
    const y = pos[i + 1];
    s.at(pos[i], y, pos[i + 2], tmp);
    const thick = smoothstep(0.015, spec.enamelSide * 1.1, tmp[4]);
    // жёлтый у шейки -> молочно-белый
    let r = 0.93 + 0.06 * thick;
    let g = 0.84 + 0.12 * thick;
    let b = 0.66 + 0.26 * thick;
    // прозрачный режущий край резцов и клыков: дентина под эмалью нет
    if (spec.kind === 'incisor' || spec.kind === 'canine') {
      const edge = smoothstep(spec.h - 0.16, spec.h - 0.02, y);
      r -= 0.1 * edge;
      g -= 0.06 * edge;
      b += 0.01 * edge;
    }
    col[i] = r;
    col[i + 1] = g;
    col[i + 2] = b;
  }
  return col;
}
